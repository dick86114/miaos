package com.miaos.android.data.database

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
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "providers")
data class ProviderEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val endpoint: String,
    val capabilitiesJson: String,
    val imageModelsJson: String,
    val textModelsJson: String,
    val videoModelsJson: String,
    val updatedAt: Long,
)

@Entity(tableName = "preferences")
data class PreferenceEntity(
    @PrimaryKey val key: String,
    val value: String,
)

@Entity(tableName = "generated_images")
data class GeneratedImageEntity(
    @PrimaryKey val id: String,
    val providerId: String,
    val providerName: String,
    val modelId: String,
    val prompt: String,
    val ratio: String,
    val quality: String,
    val imagePath: String,
    val createdAt: Long,
    val projectId: String? = null,
    val versionId: String? = null,
)

@Entity(tableName = "generation_tasks")
data class GenerationTaskEntity(
    @PrimaryKey val id: String,
    val providerId: String,
    val providerName: String,
    val providerType: String,
    val endpoint: String,
    val modelId: String,
    val prompt: String,
    val ratio: String,
    val quality: String,
    val sourceImagePath: String? = null,
    val projectId: String? = null,
    val versionId: String? = null,
    val status: String,
    val createdAt: Long,
    val startedAt: Long? = null,
    val completedAt: Long? = null,
    val errorMessage: String? = null,
    val imagePath: String? = null,
)

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val createdAt: Long,
    val updatedAt: Long,
    val coverImageId: String? = null,
    val currentVersionId: String,
)

@Entity(tableName = "project_versions")
data class ProjectVersionEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val parentVersionId: String? = null,
    val parentImageId: String? = null,
    val name: String,
    val prompt: String,
    val providerId: String,
    val providerName: String,
    val modelId: String,
    val createdAt: Long,
)

@Dao
interface ProviderDao {
    @Query("SELECT * FROM providers ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<ProviderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(providers: List<ProviderEntity>)

    @Query("DELETE FROM providers WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface PreferenceDao {
    @Query("SELECT value FROM preferences WHERE key = :key LIMIT 1")
    fun observeValue(key: String): Flow<String?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putAll(preferences: List<PreferenceEntity>)
}

@Dao
interface GeneratedImageDao {
    @Query("SELECT * FROM generated_images ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<GeneratedImageEntity>>

    @Query("SELECT * FROM generated_images WHERE versionId = :versionId ORDER BY createdAt DESC")
    fun observeForVersion(versionId: String): Flow<List<GeneratedImageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: GeneratedImageEntity)

    @Query("DELETE FROM generated_images WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT id FROM generated_images WHERE versionId IN (:versionIds)")
    suspend fun idsForVersions(versionIds: List<String>): List<String>

    @Query("DELETE FROM generated_images WHERE versionId IN (:versionIds)")
    suspend fun deleteForVersions(versionIds: List<String>)
}

@Dao
interface GenerationTaskDao {
    @Query("SELECT * FROM generation_tasks ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<GenerationTaskEntity>>

    @Query("SELECT * FROM generation_tasks WHERE id = :id LIMIT 1")
    suspend fun findById(id: String): GenerationTaskEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(task: GenerationTaskEntity)

    @Query("UPDATE generation_tasks SET status = 'running', startedAt = :startedAt, completedAt = NULL, errorMessage = NULL WHERE id = :id AND status = 'queued'")
    suspend fun markRunning(id: String, startedAt: Long): Int

    @Query("UPDATE generation_tasks SET status = 'done', imagePath = :imagePath, completedAt = :completedAt, errorMessage = NULL WHERE id = :id")
    suspend fun markCompleted(id: String, imagePath: String, completedAt: Long)

    @Query("UPDATE generation_tasks SET status = 'failed', errorMessage = :errorMessage, completedAt = :completedAt WHERE id = :id")
    suspend fun markFailed(id: String, errorMessage: String, completedAt: Long)

    @Query("UPDATE generation_tasks SET status = 'queued', startedAt = NULL, completedAt = NULL, errorMessage = NULL WHERE id = :id AND status = 'running'")
    suspend fun returnToQueue(id: String)

    @Query("UPDATE generation_tasks SET status = 'queued', startedAt = NULL, completedAt = NULL, errorMessage = NULL WHERE status = 'running'")
    suspend fun recoverInterruptedTasks()

    @Query("UPDATE generation_tasks SET status = 'queued', startedAt = NULL, completedAt = NULL, errorMessage = NULL, imagePath = NULL WHERE id = :id AND status IN ('failed', 'canceled')")
    suspend fun retry(id: String): Int

    @Query("UPDATE generation_tasks SET status = 'canceled', completedAt = :completedAt, errorMessage = NULL WHERE id = :id AND status = 'queued'")
    suspend fun cancelQueued(id: String, completedAt: Long): Int

    /** 仅允许从队列移除终态记录，生成图片历史由 generated_images 独立保存。 */
    @Query("DELETE FROM generation_tasks WHERE id = :id AND status IN ('done', 'failed', 'canceled')")
    suspend fun deleteTerminal(id: String): Int

    @Query("SELECT id FROM generation_tasks WHERE status = 'queued' ORDER BY createdAt ASC")
    suspend fun pendingIds(): List<String>

    @Query("SELECT COUNT(*) > 0 FROM generation_tasks WHERE id = :id AND status = 'running'")
    suspend fun isRunning(id: String): Boolean

    @Query("UPDATE generation_tasks SET status = 'canceled', completedAt = :completedAt, errorMessage = NULL WHERE versionId IN (:versionIds) AND status IN ('queued', 'running')")
    suspend fun cancelForVersions(versionIds: List<String>, completedAt: Long)
}

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<ProjectEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(project: ProjectEntity)

    @Query("UPDATE projects SET currentVersionId = :versionId, updatedAt = :updatedAt WHERE id = :id")
    suspend fun setCurrentVersion(id: String, versionId: String, updatedAt: Long)

    @Query("SELECT * FROM projects WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): ProjectEntity?

    @Query("UPDATE projects SET coverImageId = :imageId, updatedAt = :updatedAt WHERE id = :id")
    suspend fun setCover(id: String, imageId: String?, updatedAt: Long)

    @Query("UPDATE projects SET name = :name, description = :description, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateDetails(id: String, name: String, description: String, updatedAt: Long)

    @Query("UPDATE projects SET currentVersionId = :versionId, coverImageId = :coverImageId, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateAfterVersionDeletion(id: String, versionId: String, coverImageId: String?, updatedAt: Long)

    @Query("DELETE FROM projects WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface ProjectVersionDao {
    @Query("SELECT * FROM project_versions ORDER BY createdAt ASC")
    fun observeAll(): Flow<List<ProjectVersionEntity>>

    @Query("SELECT * FROM project_versions WHERE projectId = :projectId ORDER BY createdAt ASC")
    fun observeForProject(projectId: String): Flow<List<ProjectVersionEntity>>

    @Query("SELECT * FROM project_versions WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<ProjectVersionEntity?>

    @Query("SELECT * FROM project_versions WHERE projectId = :projectId ORDER BY createdAt ASC")
    suspend fun getForProject(projectId: String): List<ProjectVersionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(version: ProjectVersionEntity)

    @Query("UPDATE project_versions SET prompt = :prompt, providerId = :providerId, providerName = :providerName, modelId = :modelId WHERE id = :versionId")
    suspend fun updateGenerationSettings(versionId: String, prompt: String, providerId: String, providerName: String, modelId: String)

    @Query("DELETE FROM project_versions WHERE projectId = :projectId")
    suspend fun deleteForProject(projectId: String)

    @Query("DELETE FROM project_versions WHERE id IN (:versionIds)")
    suspend fun deleteByIds(versionIds: List<String>)
}

@Database(
    entities = [
        ProviderEntity::class,
        PreferenceEntity::class,
        GeneratedImageEntity::class,
        GenerationTaskEntity::class,
        ProjectEntity::class,
        ProjectVersionEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class MiaosDatabase : RoomDatabase() {
    abstract fun providerDao(): ProviderDao
    abstract fun preferenceDao(): PreferenceDao
    abstract fun generatedImageDao(): GeneratedImageDao
    abstract fun generationTaskDao(): GenerationTaskDao
    abstract fun projectDao(): ProjectDao
    abstract fun projectVersionDao(): ProjectVersionDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS generated_images (
                        id TEXT NOT NULL,
                        providerId TEXT NOT NULL,
                        providerName TEXT NOT NULL,
                        modelId TEXT NOT NULL,
                        prompt TEXT NOT NULL,
                        ratio TEXT NOT NULL,
                        quality TEXT NOT NULL,
                        imagePath TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        PRIMARY KEY(id)
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE generated_images ADD COLUMN projectId TEXT")
                db.execSQL("ALTER TABLE generated_images ADD COLUMN versionId TEXT")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        coverImageId TEXT,
                        currentVersionId TEXT NOT NULL,
                        PRIMARY KEY(id)
                    )
                """.trimIndent())
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS project_versions (
                        id TEXT NOT NULL,
                        projectId TEXT NOT NULL,
                        parentVersionId TEXT,
                        parentImageId TEXT,
                        name TEXT NOT NULL,
                        prompt TEXT NOT NULL,
                        providerId TEXT NOT NULL,
                        providerName TEXT NOT NULL,
                        modelId TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        PRIMARY KEY(id)
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS generation_tasks (
                        id TEXT NOT NULL,
                        providerId TEXT NOT NULL,
                        providerName TEXT NOT NULL,
                        providerType TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        modelId TEXT NOT NULL,
                        prompt TEXT NOT NULL,
                        ratio TEXT NOT NULL,
                        quality TEXT NOT NULL,
                        sourceImagePath TEXT,
                        projectId TEXT,
                        versionId TEXT,
                        status TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        startedAt INTEGER,
                        completedAt INTEGER,
                        errorMessage TEXT,
                        imagePath TEXT,
                        PRIMARY KEY(id)
                    )
                """.trimIndent())
            }
        }

        @Volatile
        private var instance: MiaosDatabase? = null

        /**
         * Room 的 Flow 失效通知只在同一个数据库实例内可靠传播。
         * 应用壳、设置和各工作区必须复用同一实例，才能让主题与本地配置即时同步。
         */
        fun create(context: Context): MiaosDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                MiaosDatabase::class.java,
                "miaos.db",
            ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4).build().also { created ->
                instance = created
            }
        }
    }
}
