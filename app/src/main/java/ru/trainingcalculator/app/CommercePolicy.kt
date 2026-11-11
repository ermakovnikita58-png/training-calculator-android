package ru.trainingcalculator.app

import java.security.MessageDigest
import java.util.Locale

internal enum class Store { GOOGLE_PLAY, RUSTORE }
internal enum class Tier { FREE, PRO, TRAINER }
internal enum class EntitlementState { ACTIVE, CANCELED, EXPIRED, REVOKED, PENDING }

internal data class StoreReceipt(val store: Store, val product: String, val token: String)
internal data class StoreOffer(val product: String, val title: String, val price: String)

internal fun commerceAccountId(accountId: String): String {
    require(Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}").matches(accountId))
    val scoped = "forge-commerce-v1:" + accountId.lowercase(Locale.ROOT)
    return MessageDigest.getInstance("SHA-256").digest(scoped.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(Locale.ROOT, it) }
}
internal data class VerifiedEntitlement(
    val account: String,
    val tier: Tier,
    val state: EntitlementState,
    val validUntilEpochMs: Long
) {
    fun effectiveTier(accountId: String, nowEpochMs: Long): Tier =
        if (account == accountId && validUntilEpochMs > nowEpochMs &&
            state in setOf(EntitlementState.ACTIVE, EntitlementState.CANCELED)) tier else Tier.FREE
}

/**
 * Implemented by an authenticated server which verifies store tokens, prevents
 * reuse across accounts and acknowledges a Play purchase only after verification.
 */
internal fun interface EntitlementBackend {
    suspend fun verify(receipt: StoreReceipt): VerifiedEntitlement
}
