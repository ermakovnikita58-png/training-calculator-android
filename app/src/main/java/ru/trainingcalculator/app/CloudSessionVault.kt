package ru.trainingcalculator.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class CloudSessionVault(context: Context) {
    private val prefs = context.getSharedPreferences("forge_cloud_vault", Context.MODE_PRIVATE)

    private fun key(create: Boolean): SecretKey? {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null) as? SecretKey
        if (existing != null || !create) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
            generateKey()
        }
    }

    fun save(session: JSONObject?) {
        if (session == null) {
            check(prefs.edit().clear().commit())
            return
        }
        val data = session.toString().toByteArray(Charsets.UTF_8)
        require(data.size in 1..32_768)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, requireNotNull(key(true))) }
        val encrypted = cipher.doFinal(data)
        check(prefs.edit()
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("value", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
    }

    fun load(): JSONObject? {
        val iv = prefs.getString("iv", null) ?: return null
        val value = prefs.getString("value", null) ?: return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, requireNotNull(key(false)), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        return JSONObject(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)).toString(Charsets.UTF_8))
    }

    private companion object {
        const val ALIAS = "forge_supabase_session_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
