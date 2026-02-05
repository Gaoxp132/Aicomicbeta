/**
 * Figma 插件路由
 */

import { Hono } from "npm:hono";
import {
  syncFigmaNodes,
  createSeriesFromFigma,
  uploadFigmaImage,
  getFigmaUserSeries,
} from "./handlers/figma_plugin.tsx";

const figma = new Hono();

// Figma 插件端点
figma.post("/sync", syncFigmaNodes);
figma.post("/create-series", createSeriesFromFigma);
figma.post("/upload-image", uploadFigmaImage);
figma.get("/my-series", getFigmaUserSeries);

export default figma;
