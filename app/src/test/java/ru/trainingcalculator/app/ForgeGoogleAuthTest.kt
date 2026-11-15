package ru.trainingcalculator.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForgeGoogleAuthTest {
    @Test fun nonceUsesLowercaseSha256OfTheRawValue() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ForgeGoogleAuth.hashNonce("abc")
        )
        val nonces = List(64) { ForgeGoogleAuth.newNonce() }
        assertEquals(nonces.size, nonces.toSet().size)
        assertTrue(nonces.all { it.matches(Regex("[0-9a-f]{64}")) })
        assertTrue(nonces.all { it != ForgeGoogleAuth.hashNonce(it) })
    }

    @Test fun credentialManagerRequiresAPublicGoogleClientId() {
        assertTrue(ForgeGoogleAuth.validClientId("12345-forge_test.apps.googleusercontent.com"))
        assertFalse(ForgeGoogleAuth.validClientId("GOCSPX-example-client-secret"))
        assertFalse(ForgeGoogleAuth.validClientId("123.apps.googleusercontent.com.example.test"))
        assertFalse(ForgeGoogleAuth.validClientId(""))
    }

    @Test fun builtInClientIdTakesPrecedenceOverAnEarlierTestSetting() {
        val configured = "12345-forge.apps.googleusercontent.com"
        val earlier = "12345-previous.apps.googleusercontent.com"
        assertEquals(configured, ForgeGoogleAuth.selectClientId(configured, ""))
        assertEquals(configured, ForgeGoogleAuth.selectClientId(configured, earlier))
        assertEquals(earlier, ForgeGoogleAuth.selectClientId("", earlier))
        assertEquals("", ForgeGoogleAuth.selectClientId("", "invalid"))
    }
}
