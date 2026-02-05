/**
 * 漫剧分析和调试处理器
 * 从 routes_series.tsx 提取的分析和调试逻辑
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";
import * as db from "../../database/series.tsx";
import { callVolcengineAI } from "../../ai/volcengine_ai_engine.tsx";

/**
 * 分析漫剧内容质量
 */
export async function analyzeSeries(c: Context) {
  const seriesId = c.req.param("id");
  console.log("[Series] POST /series/:id/analyze called for:", seriesId);

  try {
    // 获取漫剧数据
    let series;
    try {
      series = await db.getSeries(seriesId);
    } catch (err) {
      // 从KV获取
      const seriesData = await kv.get(`series:${seriesId}`);
      if (!seriesData) {
        return c.json({
          success: false,
          error: "Series not found"
        }, 404);
      }
      series = JSON.parse(seriesData);
    }

    if (!series) {
      return c.json({
        success: false,
        error: "Series not found"
      }, 404);
    }

    console.log("[Series] Analyzing:", series.title);

    // 准备分析数据
    const analysisData = {
      title: series.title,
      description: series.description,
      genre: series.genre,
      style: series.style,
      episodeCount: series.episodes?.length || 0,
      characterCount: series.characters?.length || 0,
      status: series.status
    };

    // 调用AI进行分析
    const prompt = `请分析以下漫剧的质量和完整性：

标题：${analysisData.title}
简介：${analysisData.description}
类型：${analysisData.genre}
风格：${analysisData.style}
剧集数：${analysisData.episodeCount}
角色数：${analysisData.characterCount}
状态：${analysisData.status}

请从以下维度评估（1-10分）：
1. 故事创意
2. 角色设计
3. 情节连贯性
4. 价值观传递
5. 受众适配度

返回JSON格式：
{
  "overallScore": 8,
  "creativity": 8,
  "characterDesign": 7,
  "coherence": 9,
  "values": 10,
  "audienceFit": 8,
  "strengths": ["优势点1", "优势点2"],
  "improvements": ["改进建议1", "改进建议2"],
  "summary": "总体评价"
}`;

    try {
      const aiResponse = await callVolcengineAI(
        prompt,
        '你是专业的内容审核和编剧顾问。直接返回JSON。',
        { 
          temperature: 0.5,
          maxTokens: 800,
          timeoutMs: 20000
        }
      );

      // 解析AI返回
      let analysis;
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) {
        console.warn("[Series] Failed to parse analysis JSON");
        analysis = null;
      }

      if (analysis && analysis.overallScore) {
        return c.json({
          success: true,
          analysis
        });
      } else {
        throw new Error("AI返回格式无效");
      }

    } catch (error: any) {
      console.error("[Series] AI analysis failed:", error);
      
      // 返回基础分析
      return c.json({
        success: true,
        analysis: {
          overallScore: 7,
          creativity: 7,
          characterDesign: 7,
          coherence: 7,
          values: 8,
          audienceFit: 7,
          strengths: ["故事完整", "符合价值观"],
          improvements: ["可以增加更多细节", "角色互动可以更丰富"],
          summary: "整体质量良好，适合目标受众",
          fallback: true
        },
        message: "使用基础分析（AI服务暂时不可用）"
      });
    }

  } catch (error: any) {
    console.error("[Series] Error analyzing series:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to analyze series"
    }, 500);
  }
}

/**
 * 获取调试信息
 */
export async function getDebugInfo(c: Context) {
  const seriesId = c.req.param("id");
  console.log("[Series] GET /series/:id/debug called for:", seriesId);

  try {
    const debugInfo: any = {
      seriesId,
      timestamp: new Date().toISOString(),
      sources: {}
    };

    // 从PostgreSQL获取
    try {
      const pgSeries = await db.getSeries(seriesId);
      if (pgSeries) {
        debugInfo.sources.postgresql = {
          found: true,
          data: pgSeries
        };
      } else {
        debugInfo.sources.postgresql = {
          found: false
        };
      }
    } catch (err: any) {
      debugInfo.sources.postgresql = {
        found: false,
        error: err.message
      };
    }

    // 从KV获取
    try {
      const kvData = await kv.get(`series:${seriesId}`);
      if (kvData) {
        debugInfo.sources.kv = {
          found: true,
          data: JSON.parse(kvData)
        };
      } else {
        debugInfo.sources.kv = {
          found: false
        };
      }
    } catch (err: any) {
      debugInfo.sources.kv = {
        found: false,
        error: err.message
      };
    }

    // 检查数据一致性
    if (debugInfo.sources.postgresql?.found && debugInfo.sources.kv?.found) {
      const pgData = debugInfo.sources.postgresql.data;
      const kvData = debugInfo.sources.kv.data;
      
      debugInfo.consistency = {
        titleMatch: pgData.title === kvData.title,
        statusMatch: pgData.status === kvData.status,
        episodeCountMatch: pgData.episodes?.length === kvData.episodes?.length
      };
    }

    return c.json({
      success: true,
      debug: debugInfo
    });

  } catch (error: any) {
    console.error("[Series] Error getting debug info:", error);
    return c.json({
      success: false,
      error: error.message || "Failed to get debug info"
    }, 500);
  }
}
