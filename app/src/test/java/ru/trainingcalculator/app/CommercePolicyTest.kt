package ru.trainingcalculator.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CommercePolicyTest {
    @Test fun storeCheckoutIsOffAndServerEntitlementsExpireAndAreAccountBound() {
        assertFalse(BuildConfig.FORGE_ENABLE_PAYMENTS)
        val verified = VerifiedEntitlement("account-a", Tier.PRO, EntitlementState.ACTIVE, 100)
        assertEquals(Tier.PRO, verified.effectiveTier("account-a", 99))
        assertEquals(Tier.FREE, verified.effectiveTier("account-a", 100))
        assertEquals(Tier.FREE, verified.effectiveTier("account-b", 99))
        assertEquals(Tier.PRO, verified.copy(state = EntitlementState.CANCELED).effectiveTier("account-a", 99))
        for (state in listOf(EntitlementState.REVOKED, EntitlementState.EXPIRED, EntitlementState.PENDING)) {
            assertEquals(Tier.FREE, verified.copy(state = state).effectiveTier("account-a", 99))
        }
    }
}
