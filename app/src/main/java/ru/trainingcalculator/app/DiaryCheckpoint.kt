package ru.trainingcalculator.app

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import org.json.JSONObject
import java.security.MessageDigest

@Entity(tableName = "diary_checkpoint")
data class DiaryCheckpoint(
    @PrimaryKey val slot: Int = 1,
    val schema: Int = 1,
    val createdAt: Long,
    val payload: String,
    val sha256: String
) {
    fun isIntact() = schema == 1 && sha256 == hash(payload) && valid(payload)

    companion object {
        const val MAX_LENGTH = 6 * 1024 * 1024

        fun create(payload: String): DiaryCheckpoint {
            require(valid(payload)) { "Invalid diary checkpoint" }
            return DiaryCheckpoint(createdAt = System.currentTimeMillis(), payload = payload, sha256 = hash(payload))
        }

        private fun valid(payload: String): Boolean {
            if (payload.length > MAX_LENGTH) return false
            return runCatching {
                val state = JSONObject(payload)
                state.optJSONObject("profile") != null &&
                    listOf("plans", "workouts", "foods").all { state.optJSONArray(it) != null }
            }.getOrDefault(false)
        }

        private fun hash(payload: String) = MessageDigest.getInstance("SHA-256")
            .digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}

@Dao
abstract class DiaryCheckpointDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract fun write(checkpoint: DiaryCheckpoint)

    @Query("SELECT slot, schema, createdAt, '' AS payload, sha256 FROM diary_checkpoint WHERE slot = 1")
    protected abstract fun metadata(): DiaryCheckpoint?

    @Query("SELECT substr(payload, :offset, 131072) FROM diary_checkpoint WHERE slot = 1")
    protected abstract fun chunk(offset: Int): String?

    // SQLite CursorWindow cannot hold all older diaries in a single row.
    @Transaction
    open fun read(): DiaryCheckpoint? {
        val checkpoint = metadata() ?: return null
        val payload = StringBuilder()
        var offset = 1
        while (true) {
            val next = chunk(offset).orEmpty()
            if (next.isEmpty()) break
            payload.append(next)
            if (payload.length > DiaryCheckpoint.MAX_LENGTH) return null
            offset += next.codePointCount(0, next.length)
        }
        return checkpoint.copy(payload = payload.toString()).takeIf { it.isIntact() }
    }

    fun save(payload: String) = write(DiaryCheckpoint.create(payload))

    @Query("DELETE FROM diary_checkpoint")
    abstract fun delete()
}

@Database(entities = [DiaryCheckpoint::class], version = 1, exportSchema = true)
abstract class ForgeDatabase : RoomDatabase() {
    abstract fun checkpoints(): DiaryCheckpointDao

    companion object {
        @Volatile private var instance: ForgeDatabase? = null

        fun get(context: Context): ForgeDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, ForgeDatabase::class.java, "forge-local.db")
                .build().also { instance = it }
        }
    }
}
