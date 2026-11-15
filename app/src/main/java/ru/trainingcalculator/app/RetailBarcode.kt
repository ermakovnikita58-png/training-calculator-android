package ru.trainingcalculator.app

internal object RetailBarcode {
    fun valid(code: String, compressed: Boolean): Boolean {
        if (code.length !in setOf(8, 12, 13) || code.any { it !in '0'..'9' }) return false
        val gtin = if (compressed) expandUpce(code) ?: return false else code
        val sum = gtin.dropLast(1).reversed().mapIndexed { index, digit ->
            digit.digitToInt() * if (index % 2 == 0) 3 else 1
        }.sum()
        return (10 - sum % 10) % 10 == gtin.last().digitToInt()
    }

    private fun expandUpce(code: String): String? {
        if (code.length != 8 || code[0] !in "01") return null
        val middle = when (code[6]) {
            '0', '1', '2' -> code.substring(1, 3) + code[6] + "0000" + code.substring(3, 6)
            '3' -> code.substring(1, 4) + "00000" + code.substring(4, 6)
            '4' -> code.substring(1, 5) + "00000" + code[5]
            else -> code.substring(1, 6) + "0000" + code[6]
        }
        return code[0] + middle + code[7]
    }
}
