package ru.trainingcalculator.app

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DiaryCheckpointTest {
    @Test fun roundTripOfLargeDiaryAndFailureKeepsLastValidCopy() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        Room.inMemoryDatabaseBuilder(context, ForgeDatabase::class.java).build().use { db ->
            val dao = db.checkpoints()
            assertNull(dao.read())
            val payload = JSONObject()
                .put("profile", JSONObject().put("name", "📘Ж".repeat(460_000)))
                .put("plans", JSONArray())
                .put("workouts", JSONArray())
                .put("foods", JSONArray()).toString()
            dao.save(payload)
            assertThrows(IllegalArgumentException::class.java) { dao.save("{\"profile\":{}}") }
            val stored = requireNotNull(dao.read())
            assertEquals(payload, stored.payload)
            assertFalse(stored.copy(payload = payload + " ").isIntact())
            assertFalse(stored.copy(schema = 2).isIntact())
            dao.delete()
            assertNull(dao.read())
        }
    }
}
