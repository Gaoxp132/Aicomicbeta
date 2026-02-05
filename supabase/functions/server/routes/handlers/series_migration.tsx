/**
 * 漫剧数据迁移处理器
 * 从 routes_series.tsx 提取的数据迁移逻辑
 * 用于从KV存储迁移到PostgreSQL
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";
import * as db from "../../database/series.tsx";

/**
 * 从KV恢复漫剧到PostgreSQL
 */
export async function recoverFromKV(c: Context) {
  const seriesId = c.req.param("id");
  console.log("[Series Migration] POST /series/:id/recover-from-kv called for:", seriesId);

  try {
    // 从KV获取数据
    const kvData = await kv.get(`series:${seriesId}`);
    
    if (!kvData) {
      return c.json({
        success: false,
        error: "Series not found in KV storage"
      }, 404);
    }

    const kvSeries = JSON.parse(kvData);
    console.log("[Series Migration] Found series in KV:", kvSeries.title);

    // 检查PostgreSQL是否已存在
    try {
      const existingSeries = await db.getSeries(seriesId);
      if (existingSeries) {
        return c.json({
          success: true,
          message: "Series already exists in PostgreSQL",
          alreadyMigrated: true,
          data: existingSeries
        });
      }
    } catch (err) {
      // 不存在，继续迁移
    }

    // 开始迁移
    console.log("[Series Migration] Starting migration to PostgreSQL...");

    // 1. 创建漫剧
    const seriesData = {
      id: kvSeries.id,
      title: kvSeries.title,
      description: kvSeries.description,
      genre: kvSeries.genre,
      style: kvSeries.style,
      user_phone: kvSeries.userPhone,
      total_episodes: kvSeries.totalEpisodes || kvSeries.episodes?.length || 0,
      status: kvSeries.status,
      cover_image_url: kvSeries.coverImage,  // ✅ 使用正确的列名
      created_at: kvSeries.createdAt,
      updated_at: kvSeries.updatedAt
    };

    await db.createSeries(seriesData);
    console.log("[Series Migration] ✅ Series created in PostgreSQL");

    // 2. 迁移角色
    if (kvSeries.characters && kvSeries.characters.length > 0) {
      console.log("[Series Migration] Migrating", kvSeries.characters.length, "characters...");
      
      for (const char of kvSeries.characters) {
        try {
          await db.createCharacters(seriesId, [{
            id: char.id,
            name: char.name,
            description: char.description,
            avatar: char.avatar,
            appearance: char.appearance,
            personality: char.personality,
            role: char.role
          }]);
        } catch (err: any) {
          console.warn("[Series Migration] Failed to migrate character:", char.name, err.message);
        }
      }
      console.log("[Series Migration] ✅ Characters migrated");
    }

    // 3. 迁移剧集
    if (kvSeries.episodes && kvSeries.episodes.length > 0) {
      console.log("[Series Migration] Migrating", kvSeries.episodes.length, "episodes...");
      
      for (const episode of kvSeries.episodes) {
        try {
          const episodeData = {
            id: episode.id,
            episode_number: episode.episodeNumber,
            title: episode.title,
            synopsis: episode.synopsis,
            status: episode.status,
            created_at: episode.createdAt,
            updated_at: episode.updatedAt
          };
          
          await db.createEpisodes(seriesId, [episodeData]);

          // 迁移分镜
          if (episode.storyboards && episode.storyboards.length > 0) {
            for (const storyboard of episode.storyboards) {
              try {
                await db.createStoryboards(episode.id, [{
                  id: storyboard.id,
                  scene_number: storyboard.sceneNumber,
                  description: storyboard.description,
                  dialogue: storyboard.dialogue,
                  location: storyboard.location,
                  time_of_day: storyboard.timeOfDay,
                  camera_angle: storyboard.cameraAngle,
                  duration: storyboard.duration,
                  video_url: storyboard.videoUrl,
                  status: storyboard.status,
                  task_id: storyboard.taskId
                }]);
              } catch (err: any) {
                console.warn("[Series Migration] Failed to migrate storyboard:", err.message);
              }
            }
          }
        } catch (err: any) {
          console.warn("[Series Migration] Failed to migrate episode:", episode.title, err.message);
        }
      }
      console.log("[Series Migration] ✅ Episodes and storyboards migrated");
    }

    // 获取迁移后的完整数据
    const migratedSeries = await db.getSeries(seriesId);

    console.log("[Series Migration] ✅ Migration completed successfully");

    return c.json({
      success: true,
      message: "Series migrated from KV to PostgreSQL",
      data: migratedSeries,
      migration: {
        charactersMigrated: kvSeries.characters?.length || 0,
        episodesMigrated: kvSeries.episodes?.length || 0,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error("[Series Migration] Error during migration:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to migrate series",
      details: error.stack?.substring(0, 200)
    }, 500);
  }
}

/**
 * 批量迁移用户的所有漫剧
 */
export async function batchMigrate(c: Context) {
  console.log("[Series Migration] POST /series/batch-migrate called");

  try {
    const body = await c.req.json();
    const { userPhone } = body;

    if (!userPhone) {
      return c.json({
        success: false,
        error: "userPhone is required"
      }, 400);
    }

    console.log("[Series Migration] Batch migrating for user:", userPhone);

    // 获取用户的所有系列ID
    const userSeriesKey = `user:${userPhone}:series`;
    const userSeriesData = await kv.get(userSeriesKey);

    if (!userSeriesData) {
      return c.json({
        success: true,
        message: "No series found for user in KV",
        migrated: 0
      });
    }

    const seriesIds = JSON.parse(userSeriesData);
    console.log("[Series Migration] Found", seriesIds.length, "series to migrate");

    const results = {
      total: seriesIds.length,
      success: 0,
      failed: 0,
      alreadyMigrated: 0,
      errors: [] as any[]
    };

    // 逐个迁移
    for (const seriesId of seriesIds) {
      try {
        const kvData = await kv.get(`series:${seriesId}`);
        if (!kvData) {
          results.failed++;
          results.errors.push({ seriesId, error: "Not found in KV" });
          continue;
        }

        // 检查是否已迁移
        try {
          const existing = await db.getSeries(seriesId);
          if (existing) {
            results.alreadyMigrated++;
            continue;
          }
        } catch (err) {
          // 不存在，继续
        }

        // 迁移（简化版，只迁移基本信息）
        const kvSeries = JSON.parse(kvData);
        await db.createSeries({
          id: kvSeries.id,
          title: kvSeries.title,
          description: kvSeries.description,
          genre: kvSeries.genre,
          style: kvSeries.style,
          user_phone: kvSeries.userPhone,
          total_episodes: kvSeries.totalEpisodes || 0,
          status: kvSeries.status,
          cover_image_url: kvSeries.coverImage,  // ✅ 使用正确的列名
          created_at: kvSeries.createdAt,
          updated_at: kvSeries.updatedAt
        });

        results.success++;
        console.log("[Series Migration] ✅ Migrated:", kvSeries.title);

      } catch (err: any) {
        results.failed++;
        results.errors.push({ seriesId, error: err.message });
        console.error("[Series Migration] ❌ Failed to migrate:", seriesId, err.message);
      }
    }

    return c.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error("[Series Migration] Batch migration error:", error);
    return c.json({
      success: false,
      error: error.message || "Batch migration failed"
    }, 500);
  }
}