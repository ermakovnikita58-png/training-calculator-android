package ru.trainingcalculator.app

import android.app.Activity
import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import javax.net.ssl.HttpsURLConnection

internal class ForgeGoogleAuth(private val activity: Activity) {
    private val credentials = CredentialManager.create(activity)

    data class Result(val status: String, val session: JSONObject? = null)

    suspend fun signIn(savedClientId: String, apiKey: String): Result {
        val clientId = selectClientId(BuildConfig.FORGE_GOOGLE_WEB_CLIENT_ID, savedClientId)
        if (clientId.isEmpty()) return Result("client_not_configured")
        if (!isPublicKey(apiKey)) return Result("configuration")
        return try {
            val settings = withContext(Dispatchers.IO) { request(apiKey, "/auth/v1/settings") }
            if (settings.optJSONObject("external")?.optBoolean("google") != true) {
                return Result("provider_disabled")
            }

            val nonce = newNonce()
            val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(hashNonce(nonce)).build()
            val credentialRequest = GetCredentialRequest.Builder().addCredentialOption(option).build()
            val credential = credentials.getCredential(context = activity, request = credentialRequest).credential
            if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                return Result("failed")
            }
            val googleIdToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            val session = withContext(Dispatchers.IO) {
                val body = JSONObject()
                    .put("provider", "google")
                    .put("id_token", googleIdToken)
                    .put("nonce", nonce)
                publicSession(request(apiKey, "/auth/v1/token?grant_type=id_token", body))
            }
            Result("ok", session)
        } catch (_: GetCredentialCancellationException) {
            Result("cancelled")
        } catch (_: NoCredentialException) {
            Result("no_account")
        } catch (_: GetCredentialProviderConfigurationException) {
            Result("unavailable")
        } catch (_: GetCredentialUnsupportedException) {
            Result("unavailable")
        } catch (_: GetCredentialException) {
            Result("failed")
        } catch (_: GoogleIdTokenParsingException) {
            Result("failed")
        } catch (_: JSONException) {
            Result("failed")
        } catch (error: SupabaseError) {
            Result(error.status)
        } catch (_: IOException) {
            Result("network")
        }
    }

    suspend fun clearCredentialState() {
        try {
            credentials.clearCredentialState(ClearCredentialStateRequest())
        } catch (_: ClearCredentialException) {
            // The local session is cleared independently of the credential provider.
        }
    }

    private fun request(apiKey: String, path: String, body: JSONObject? = null): JSONObject {
        val connection = URL(PROJECT_URL + path).openConnection() as HttpsURLConnection
        try {
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("apikey", apiKey)
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() }
                val code = runCatching { JSONObject(errorBody.orEmpty()).optString("error_code") }.getOrNull()
                throw SupabaseError(when {
                    code == "provider_disabled" -> "provider_disabled"
                    status == 429 -> "rate_limited"
                    status >= 500 -> "network"
                    status == 401 && body == null -> "configuration"
                    else -> "failed"
                })
            }
            return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        } finally {
            connection.disconnect()
        }
    }

    private class SupabaseError(val status: String) : Exception()

    companion object {
        const val PROJECT_URL = "https://evwvbozhfsprcabrfefe.supabase.co"
        private val random = SecureRandom()
        private val webClientId = Regex("[A-Za-z0-9_-]{1,128}\\.apps\\.googleusercontent\\.com")
        private val publishableKey = Regex("sb_publishable_[A-Za-z0-9_-]{15,}")
        private val legacyKey = Regex("eyJ[A-Za-z0-9_-]+\\.([A-Za-z0-9_-]+)\\.[A-Za-z0-9_-]+")

        internal fun validClientId(value: String) = webClientId.matches(value)
        internal fun selectClientId(builtIn: String, saved: String): String =
            builtIn.ifEmpty { saved.takeIf(::validClientId).orEmpty() }
        internal fun newNonce() = ByteArray(32).also(random::nextBytes).toHex()
        internal fun hashNonce(nonce: String) =
            MessageDigest.getInstance("SHA-256").digest(nonce.toByteArray(Charsets.UTF_8)).toHex()

        private fun ByteArray.toHex(): String = joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

        private fun isPublicKey(key: String): Boolean {
            if (key.length !in 1..4096) return false
            if (publishableKey.matches(key)) return true
            val payload = legacyKey.matchEntire(key)?.groupValues?.get(1) ?: return false
            return runCatching {
                val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
                JSONObject(String(decoded, Charsets.UTF_8)).optString("role") == "anon"
            }.getOrDefault(false)
        }

        internal fun publicSession(data: JSONObject): JSONObject {
            val user = data.getJSONObject("user")
            val id = user.opt("id") as? String
            val access = data.opt("access_token") as? String
            val refresh = data.opt("refresh_token") as? String
            val expiry = data.optLong("expires_in")
            if (id.isNullOrBlank() || access.isNullOrBlank() || refresh.isNullOrBlank() || expiry <= 0) {
                throw JSONException("Incomplete Supabase session")
            }
            return JSONObject()
                .put("access_token", access)
                .put("refresh_token", refresh)
                .put("expires_in", expiry)
                .put("user", JSONObject().put("id", id).put("email", user.opt("email") as? String ?: ""))
        }
    }
}
