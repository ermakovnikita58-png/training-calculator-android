package ru.trainingcalculator.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RetailBarcodeTest {
    @Test fun validatesRetailCodes() {
        assertTrue(RetailBarcode.valid("4006381333931", false))
        assertTrue(RetailBarcode.valid("96385074", false))
        assertTrue(RetailBarcode.valid("036000291452", false))
        assertTrue(RetailBarcode.valid("04252614", true))
        assertFalse(RetailBarcode.valid("04252615", true))
        assertFalse(RetailBarcode.valid("04252614", false))
        assertFalse(RetailBarcode.valid("4006381333930", false))
        assertFalse(RetailBarcode.valid("03600029145１", false))
    }
}
