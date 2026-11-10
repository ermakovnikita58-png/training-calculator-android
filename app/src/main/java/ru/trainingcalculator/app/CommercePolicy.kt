package ru.trainingcalculator.app

internal enum class Store { GOOGLE_PLAY, RUSTORE }
internal enum class Tier { FREE, PRO, TRAINER }
internal enum class EntitlementState { ACTIVE, CANCELED, EXPIRED, REVOKED, PENDING }

internal data class StoreReceipt(val store: Store, val product: String, val token: String)
internal data class StoreOffer(val product: String, val title: String, val price: String)
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
