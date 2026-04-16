// ==UserScript==
// @name         Gemini NanoBanana Watermark Remover
// @name:zh-CN   Gemini NanoBanana 图片水印移除
// @namespace    https://github.com/GargantuaX
// @version      1.0.10
// @description  Automatically removes watermarks from Gemini AI generated images
// @description:zh-CN 自动移除 Gemini AI 生成图像中的水印
// @icon         https://www.google.com/s2/favicons?domain=gemini.google.com
// @author       GargantuaX
// @license      MIT
// @match        https://gemini.google.com/app
// @match        https://gemini.google.com/app/*
// @match        https://gemini.google.com/*
// @match        https://business.gemini.google/app
// @match        https://business.gemini.google/app/*
// @match        https://business.gemini.google/*
// @connect      googleusercontent.com
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(() => {
  // src/shared/actionContextCompat.js
  function resolveCompatibleActionContext(actionContext = null) {
    return actionContext && typeof actionContext === "object" ? actionContext : null;
  }
  function resolveCompatibleActionContextFromPayload(payload = null) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return resolveCompatibleActionContext(payload.actionContext);
  }
  function createActionContextProvider({
    getActionContext = null
  } = {}) {
    return (...args) => resolveActionContextFromProviders({
      getActionContext,
      args
    });
  }
  function resolveActionContextFromProviders({
    getActionContext = null,
    args = []
  } = {}) {
    return typeof getActionContext === "function" ? getActionContext(...args) : null;
  }
  function appendCompatibleActionContext(payload = {}, actionContext = null) {
    if (!actionContext || typeof actionContext !== "object") {
      return { ...payload };
    }
    return {
      ...payload,
      actionContext
    };
  }
  function getActionContextFromIntentGate(intentGate = null, candidate = null) {
    if (!intentGate || typeof intentGate !== "object") {
      return null;
    }
    if (typeof intentGate.getRecentActionContext === "function") {
      return intentGate.getRecentActionContext(candidate);
    }
    return null;
  }

  // src/core/canvasBlob.js
  async function canvasToBlob(canvas, type = "image/png") {
    if (typeof canvas?.convertToBlob === "function") {
      return await canvas.convertToBlob({ type });
    }
    if (typeof canvas?.toBlob === "function") {
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to encode image blob"));
          }
        }, type);
      });
    }
    throw new Error("Canvas blob export API is unavailable");
  }

  // src/core/watermarkDecisionPolicy.js
  var STANDARD_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.3;
  var STANDARD_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.12;
  var STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.295;
  var STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.45;
  var ADAPTIVE_DIRECT_MATCH_MIN_CONFIDENCE = 0.5;
  var ADAPTIVE_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.45;
  var ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.12;
  var ADAPTIVE_DIRECT_MATCH_MIN_SIZE = 40;
  var ADAPTIVE_DIRECT_MATCH_MAX_SIZE = 192;
  var ATTRIBUTION_MIN_SIZE = 24;
  var ATTRIBUTION_MAX_SIZE = 192;
  var ATTRIBUTION_MAX_RESIDUAL_SCORE = 0.2;
  var ATTRIBUTION_MIN_SUPPRESSION_GAIN = 0.25;
  var ATTRIBUTION_MIN_SPATIAL_SCORE = 0.22;
  var ATTRIBUTION_MIN_VALIDATED_SPATIAL_SCORE = 0.2;
  var ATTRIBUTION_MIN_VALIDATED_SUPPRESSION_GAIN = 0.3;
  var ATTRIBUTION_MIN_ADAPTIVE_CONFIDENCE = 0.35;
  var ATTRIBUTION_MIN_ADAPTIVE_SUPPRESSION_GAIN = 0.16;
  function toFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function isPositionSized(position) {
    const width = toFiniteNumber(position?.width);
    const height = toFiniteNumber(position?.height);
    return width !== null && height !== null;
  }
  function classifyStandardWatermarkSignal({ spatialScore, gradientScore }) {
    const spatial = toFiniteNumber(spatialScore);
    const gradient = toFiniteNumber(gradientScore);
    if (spatial === null || gradient === null) {
      return { tier: "insufficient" };
    }
    if (spatial >= STANDARD_DIRECT_MATCH_MIN_SPATIAL_SCORE && gradient >= STANDARD_DIRECT_MATCH_MIN_GRADIENT_SCORE || spatial >= STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE && gradient >= STANDARD_STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE) {
      return { tier: "direct-match" };
    }
    if (spatial > 0 || gradient > 0) {
      return { tier: "needs-validation" };
    }
    return { tier: "insufficient" };
  }
  function classifyAdaptiveWatermarkSignal(adaptiveResult) {
    if (!adaptiveResult || adaptiveResult.found !== true) {
      return { tier: "insufficient" };
    }
    const confidence = toFiniteNumber(adaptiveResult.confidence);
    const spatial = toFiniteNumber(adaptiveResult.spatialScore);
    const gradient = toFiniteNumber(adaptiveResult.gradientScore);
    const size = toFiniteNumber(adaptiveResult?.region?.size);
    if (confidence === null || spatial === null || gradient === null || size === null) {
      return { tier: "insufficient" };
    }
    if (confidence >= ADAPTIVE_DIRECT_MATCH_MIN_CONFIDENCE && spatial >= ADAPTIVE_DIRECT_MATCH_MIN_SPATIAL_SCORE && gradient >= ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE && size >= ADAPTIVE_DIRECT_MATCH_MIN_SIZE && size <= ADAPTIVE_DIRECT_MATCH_MAX_SIZE) {
      return { tier: "direct-match" };
    }
    if (size >= ADAPTIVE_DIRECT_MATCH_MIN_SIZE && size <= ADAPTIVE_DIRECT_MATCH_MAX_SIZE && gradient >= ADAPTIVE_DIRECT_MATCH_MIN_GRADIENT_SCORE && (confidence > 0 || spatial > 0)) {
      return { tier: "needs-validation" };
    }
    return { tier: "insufficient" };
  }
  function classifyGeminiAttributionFromWatermarkMeta(watermarkMeta) {
    if (!watermarkMeta || typeof watermarkMeta !== "object") {
      return { tier: "insufficient" };
    }
    if (watermarkMeta.applied === false) {
      return { tier: "insufficient" };
    }
    const size = toFiniteNumber(watermarkMeta.size);
    if (size === null || size < ATTRIBUTION_MIN_SIZE || size > ATTRIBUTION_MAX_SIZE) {
      return { tier: "insufficient" };
    }
    if (!isPositionSized(watermarkMeta.position)) {
      return { tier: "insufficient" };
    }
    const detection = watermarkMeta.detection || {};
    const adaptiveConfidence = toFiniteNumber(detection.adaptiveConfidence);
    const originalSpatialScore = toFiniteNumber(detection.originalSpatialScore);
    const processedSpatialScore = toFiniteNumber(detection.processedSpatialScore);
    const suppressionGain = toFiniteNumber(detection.suppressionGain);
    const source = typeof watermarkMeta.source === "string" ? watermarkMeta.source : "";
    if (adaptiveConfidence !== null && suppressionGain !== null && adaptiveConfidence >= ATTRIBUTION_MIN_ADAPTIVE_CONFIDENCE && suppressionGain >= ATTRIBUTION_MIN_ADAPTIVE_SUPPRESSION_GAIN) {
      return { tier: "adaptive-match" };
    }
    if (source.includes("validated") && originalSpatialScore !== null && processedSpatialScore !== null && suppressionGain !== null && originalSpatialScore >= ATTRIBUTION_MIN_VALIDATED_SPATIAL_SCORE && processedSpatialScore <= ATTRIBUTION_MAX_RESIDUAL_SCORE && suppressionGain >= ATTRIBUTION_MIN_VALIDATED_SUPPRESSION_GAIN) {
      return { tier: "validated-match" };
    }
    if (originalSpatialScore !== null && processedSpatialScore !== null && suppressionGain !== null && originalSpatialScore >= ATTRIBUTION_MIN_SPATIAL_SCORE && processedSpatialScore <= ATTRIBUTION_MAX_RESIDUAL_SCORE && suppressionGain >= ATTRIBUTION_MIN_SUPPRESSION_GAIN) {
      return { tier: "safe-removal" };
    }
    return { tier: "insufficient" };
  }

  // src/userscript/urlUtils.js
  function isGoogleusercontentHost(hostname) {
    return hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com");
  }
  function hasNativeDownloadTokenAtTail(pathname) {
    return /=(?:d|d-I)$/i.test(String(pathname || ""));
  }
  function classifyGeminiAssetPath(pathname) {
    if (typeof pathname !== "string" || pathname.length === 0) return null;
    const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
    if (!firstSegment) return null;
    if (firstSegment.startsWith("rd-")) {
      const variant = firstSegment.slice(3);
      return {
        family: "rd",
        variant: variant.endsWith("-dl") ? variant.slice(0, -3) : variant,
        isPreview: false,
        isDownload: variant.endsWith("-dl")
      };
    }
    if (firstSegment === "gg") {
      return {
        family: "gg",
        variant: "",
        isPreview: true,
        isDownload: false
      };
    }
    if (!firstSegment.startsWith("gg-")) {
      return null;
    }
    const ggVariant = firstSegment.slice(3);
    const isDownload = ggVariant === "dl" || ggVariant.endsWith("-dl");
    const normalizedVariant = isDownload ? ggVariant === "dl" ? "" : ggVariant.slice(0, -3) : ggVariant;
    return {
      family: "gg",
      variant: normalizedVariant,
      isPreview: !isDownload,
      isDownload
    };
  }
  function hasGeminiAssetPath(pathname) {
    return classifyGeminiAssetPath(pathname) !== null;
  }
  function classifyGeminiAssetUrl(url) {
    if (typeof url !== "string" || url.length === 0) return null;
    try {
      const parsed = new URL(url);
      if (!isGoogleusercontentHost(parsed.hostname)) {
        return null;
      }
      return classifyGeminiAssetPath(parsed.pathname);
    } catch {
      return null;
    }
  }
  function isGeminiGeneratedAssetUrl(url) {
    return classifyGeminiAssetUrl(url) !== null;
  }
  function isGeminiPreviewAssetUrl(url) {
    return classifyGeminiAssetUrl(url)?.isPreview === true;
  }
  function isGeminiDisplayPreviewAssetUrl(url) {
    if (typeof url !== "string" || url.length === 0) return false;
    try {
      const parsed = new URL(url);
      if (!isGoogleusercontentHost(parsed.hostname)) {
        return false;
      }
      const classification = classifyGeminiAssetPath(parsed.pathname);
      if (!classification || classification.family !== "gg") {
        return false;
      }
      if (classification.isPreview === true) {
        return hasNativeDownloadTokenAtTail(parsed.pathname) === false;
      }
      if (hasNativeDownloadTokenAtTail(parsed.pathname)) {
        return false;
      }
      return classification.isDownload === true && /-rj$/i.test(parsed.pathname) && hasNativeDownloadTokenAtTail(parsed.pathname) === false;
    } catch {
      return false;
    }
  }
  function isGeminiOriginalAssetUrl(url) {
    if (typeof url !== "string" || url.length === 0) return false;
    try {
      const parsed = new URL(url);
      if (!isGoogleusercontentHost(parsed.hostname)) {
        return false;
      }
      const classification = classifyGeminiAssetPath(parsed.pathname);
      if (!classification) {
        return false;
      }
      return classification.isPreview === false || hasNativeDownloadTokenAtTail(parsed.pathname);
    } catch {
      return false;
    }
  }
  function normalizeGoogleusercontentImageUrl(url) {
    if (!isGeminiGeneratedAssetUrl(url)) return url;
    try {
      const parsed = new URL(url);
      if (!hasGeminiAssetPath(parsed.pathname)) {
        return url;
      }
      const path = parsed.pathname;
      const dimensionPairAtTail = /=w\d+-h\d+([^/]*)$/i;
      if (dimensionPairAtTail.test(path)) {
        parsed.pathname = path.replace(dimensionPairAtTail, "=s0$1");
        return parsed.toString();
      }
      if (hasNativeDownloadTokenAtTail(path)) {
        parsed.pathname = path.replace(/=(?:d|d-I)$/i, (match) => `=s0-${match.slice(1)}`);
        return parsed.toString();
      }
      const sizeTransformAtTail = /=(?:s|w|h)\d+([^/]*)$/i;
      if (sizeTransformAtTail.test(path)) {
        parsed.pathname = path.replace(sizeTransformAtTail, "=s0$1");
        return parsed.toString();
      }
      parsed.pathname = `${path}=s0`;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // src/shared/errorUtils.js
  function stringifyErrorPayload(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  function normalizeErrorMessage(error, fallback = "Unknown error") {
    if (error instanceof Error) {
      return error.message || fallback;
    }
    if (typeof error === "string") {
      return error.trim() || fallback;
    }
    if (error && typeof error === "object") {
      if (typeof error.message === "string" && error.message.trim()) {
        return error.message.trim();
      }
      if (typeof error.error === "string" && error.error.trim()) {
        return error.error.trim();
      }
      const status = Number.isFinite(error.status) ? String(error.status) : "";
      const statusText = typeof error.statusText === "string" ? error.statusText.trim() : "";
      const combinedStatus = `${status} ${statusText}`.trim();
      if (combinedStatus) {
        return combinedStatus;
      }
      const serialized = stringifyErrorPayload(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    }
    return fallback;
  }

  // src/shared/imageSessionStore.js
  function normalizeAssetId(value, prefix) {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith(prefix) || trimmed.length <= prefix.length) {
      return "";
    }
    return trimmed;
  }
  function normalizeImageSessionAssetIds(assetIds = null) {
    const normalized = {
      responseId: normalizeAssetId(assetIds?.responseId, "r_"),
      draftId: normalizeAssetId(assetIds?.draftId, "rc_"),
      conversationId: normalizeAssetId(assetIds?.conversationId, "c_")
    };
    if (!normalized.responseId && !normalized.draftId && !normalized.conversationId) {
      return null;
    }
    return normalized;
  }
  function buildImageSessionKey(assetIds = null) {
    const normalizedAssetIds = normalizeImageSessionAssetIds(assetIds);
    if (!normalizedAssetIds) {
      return "";
    }
    if (normalizedAssetIds.draftId) {
      return `draft:${normalizedAssetIds.draftId}`;
    }
    if (normalizedAssetIds.responseId && normalizedAssetIds.conversationId) {
      return `response:${normalizedAssetIds.responseId}|conversation:${normalizedAssetIds.conversationId}`;
    }
    return "";
  }
  function createEmptySurfaceCollection() {
    return {
      preview: /* @__PURE__ */ new Set(),
      fullscreen: /* @__PURE__ */ new Set(),
      unknown: /* @__PURE__ */ new Set()
    };
  }
  function createEmptyProcessedResourceRecord() {
    return {
      objectUrl: "",
      blob: null,
      blobType: "",
      processedMeta: null,
      processedFrom: ""
    };
  }
  function createEmptyProcessedResourceSlots() {
    return {
      preview: createEmptyProcessedResourceRecord(),
      full: createEmptyProcessedResourceRecord()
    };
  }
  function createSessionRecord(sessionKey, assetIds, now = Date.now()) {
    return {
      sessionKey,
      assetIds: normalizeImageSessionAssetIds(assetIds),
      sources: {
        originalUrl: "",
        previewUrl: "",
        currentBlobUrl: ""
      },
      derived: {
        processedBlobUrl: "",
        processedBlobType: "",
        processedMeta: null,
        processedFrom: "",
        processedSlots: createEmptyProcessedResourceSlots()
      },
      state: {
        preview: "idle",
        fullscreen: "idle",
        unknown: "idle",
        lastError: ""
      },
      surfaces: createEmptySurfaceCollection(),
      timestamps: {
        createdAt: Number(now) || Date.now(),
        updatedAt: Number(now) || Date.now(),
        lastProcessedAt: 0
      }
    };
  }
  function touchSession(session, now = Date.now()) {
    session.timestamps.updatedAt = Number(now) || Date.now();
    return session;
  }
  function normalizeSurfaceType(surface = "") {
    const normalizedSurface = typeof surface === "string" ? surface.trim().toLowerCase() : "";
    if (normalizedSurface === "preview" || normalizedSurface === "fullscreen") {
      return normalizedSurface;
    }
    return "unknown";
  }
  function normalizeProcessedResourceSlot(slot = "") {
    const normalizedSlot = typeof slot === "string" ? slot.trim().toLowerCase() : "";
    if (normalizedSlot === "full") {
      return "full";
    }
    return "preview";
  }
  function readElementProcessedObjectUrl(element) {
    const objectUrl = typeof element?.dataset?.gwrWatermarkObjectUrl === "string" ? element.dataset.gwrWatermarkObjectUrl.trim() : "";
    return objectUrl || "";
  }
  function isUsableSurfaceElement(element) {
    if (!element || typeof element !== "object") {
      return false;
    }
    if ("isConnected" in element) {
      return Boolean(element.isConnected);
    }
    return true;
  }
  function findPreferredSurfaceElement(elements, preferredProcessedUrl = "") {
    let processedMatch = null;
    let processedFallback = null;
    let plainFallback = null;
    for (const element of elements) {
      if (!isUsableSurfaceElement(element)) {
        continue;
      }
      const processedObjectUrl = readElementProcessedObjectUrl(element);
      if (processedObjectUrl && preferredProcessedUrl && processedObjectUrl === preferredProcessedUrl) {
        return element;
      }
      if (processedObjectUrl) {
        processedFallback ||= element;
        continue;
      }
      plainFallback ||= element;
    }
    processedMatch ||= processedFallback;
    return processedMatch || plainFallback || null;
  }
  function readProcessedSlotResource(session, slot) {
    const normalizedSlot = normalizeProcessedResourceSlot(slot);
    const resource = session?.derived?.processedSlots?.[normalizedSlot] || null;
    if (!resource?.objectUrl) {
      return null;
    }
    return {
      kind: "processed",
      url: resource.objectUrl,
      ...resource.blob ? { blob: resource.blob } : {},
      mimeType: resource.blobType || "image/png",
      processedMeta: resource.processedMeta,
      source: resource.processedFrom || "processed",
      slot: normalizedSlot
    };
  }
  function syncLegacyProcessedFields(session) {
    const previewResource = readProcessedSlotResource(session, "preview");
    const fullResource = readProcessedSlotResource(session, "full");
    const preferredResource = previewResource || fullResource;
    session.derived.processedBlobUrl = preferredResource?.url || "";
    session.derived.processedBlobType = preferredResource?.mimeType || "";
    session.derived.processedMeta = preferredResource?.processedMeta ?? null;
    session.derived.processedFrom = preferredResource?.source || "";
  }
  function buildOriginalResource(session) {
    if (!session?.sources?.originalUrl) {
      return null;
    }
    return {
      kind: "original",
      url: session.sources.originalUrl,
      mimeType: "",
      processedMeta: null,
      source: "original"
    };
  }
  function isFullQualityAction(action = "") {
    return action === "clipboard" || action === "download";
  }
  function createImageSessionStore({
    now = () => Date.now()
  } = {}) {
    const sessions = /* @__PURE__ */ new Map();
    const elementBindings = /* @__PURE__ */ new WeakMap();
    function getSession(sessionKey = "") {
      if (!sessionKey) {
        return null;
      }
      return sessions.get(sessionKey) || null;
    }
    function getOrCreateByAssetIds(assetIds = null) {
      const normalizedAssetIds = normalizeImageSessionAssetIds(assetIds);
      const sessionKey = buildImageSessionKey(normalizedAssetIds);
      if (!sessionKey) {
        return "";
      }
      let session = sessions.get(sessionKey);
      if (!session) {
        session = createSessionRecord(sessionKey, normalizedAssetIds, now());
        sessions.set(sessionKey, session);
        return sessionKey;
      }
      if (!session.assetIds) {
        session.assetIds = normalizedAssetIds;
      } else {
        session.assetIds = {
          responseId: session.assetIds.responseId || normalizedAssetIds.responseId,
          draftId: session.assetIds.draftId || normalizedAssetIds.draftId,
          conversationId: session.assetIds.conversationId || normalizedAssetIds.conversationId
        };
      }
      touchSession(session, now());
      return sessionKey;
    }
    function getByAssetIds(assetIds = null) {
      const sessionKey = buildImageSessionKey(assetIds);
      return sessionKey ? sessions.get(sessionKey) || null : null;
    }
    function attachElement(sessionKey, surface, element) {
      const session = getSession(sessionKey);
      if (!session || !element || typeof element !== "object") {
        return false;
      }
      detachElement(element);
      const normalizedSurface = normalizeSurfaceType(surface);
      session.surfaces[normalizedSurface].add(element);
      elementBindings.set(element, {
        sessionKey,
        surface: normalizedSurface
      });
      touchSession(session, now());
      return true;
    }
    function detachElement(element) {
      const binding = elementBindings.get(element);
      if (!binding) {
        return false;
      }
      const session = getSession(binding.sessionKey);
      if (session) {
        session.surfaces[binding.surface]?.delete(element);
        touchSession(session, now());
      }
      elementBindings.delete(element);
      return true;
    }
    function updateOriginalSource(sessionKey, sourceUrl = "") {
      const session = getSession(sessionKey);
      const normalizedUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
      if (!session || !normalizedUrl) {
        return false;
      }
      session.sources.originalUrl = normalizedUrl;
      touchSession(session, now());
      return true;
    }
    function updateSourceSnapshot(sessionKey, {
      sourceUrl = "",
      isPreviewSource = false
    } = {}) {
      const session = getSession(sessionKey);
      const normalizedUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
      if (!session || !normalizedUrl) {
        return false;
      }
      if (normalizedUrl.startsWith("blob:") || normalizedUrl.startsWith("data:")) {
        session.sources.currentBlobUrl = normalizedUrl;
      } else if (isPreviewSource) {
        session.sources.previewUrl = normalizedUrl;
      } else {
        session.sources.originalUrl ||= normalizedUrl;
      }
      touchSession(session, now());
      return true;
    }
    function updateProcessedResult(sessionKey, {
      slot = "preview",
      objectUrl = "",
      blob = null,
      blobType = "",
      processedMeta = null,
      processedFrom = ""
    } = {}) {
      const session = getSession(sessionKey);
      const normalizedObjectUrl = typeof objectUrl === "string" ? objectUrl.trim() : "";
      if (!session || !normalizedObjectUrl) {
        return false;
      }
      const normalizedSlot = normalizeProcessedResourceSlot(slot);
      if (!session.derived.processedSlots) {
        session.derived.processedSlots = createEmptyProcessedResourceSlots();
      }
      session.derived.processedSlots[normalizedSlot] = {
        objectUrl: normalizedObjectUrl,
        blob: blob instanceof Blob ? blob : null,
        blobType: typeof blobType === "string" ? blobType.trim() : "",
        processedMeta: processedMeta ?? null,
        processedFrom: typeof processedFrom === "string" ? processedFrom.trim() : ""
      };
      syncLegacyProcessedFields(session);
      const timestamp = Number(now()) || Date.now();
      touchSession(session, timestamp);
      session.timestamps.lastProcessedAt = timestamp;
      return true;
    }
    function markProcessing(sessionKey, surface, status, error = "") {
      const session = getSession(sessionKey);
      if (!session) {
        return false;
      }
      const normalizedSurface = normalizeSurfaceType(surface);
      session.state[normalizedSurface] = typeof status === "string" ? status : "idle";
      session.state.lastError = typeof error === "string" ? error : "";
      touchSession(session, now());
      return true;
    }
    function getBestResource(sessionKey, action = "display") {
      const session = getSession(sessionKey);
      if (!session) {
        return null;
      }
      const fullProcessedResource = readProcessedSlotResource(session, "full");
      const previewProcessedResource = readProcessedSlotResource(session, "preview");
      if (isFullQualityAction(action)) {
        if (fullProcessedResource) {
          return fullProcessedResource;
        }
        const originalResource2 = buildOriginalResource(session);
        if (originalResource2) {
          return originalResource2;
        }
      } else {
        if (previewProcessedResource) {
          return previewProcessedResource;
        }
        if (fullProcessedResource) {
          return fullProcessedResource;
        }
      }
      const originalResource = buildOriginalResource(session);
      if (originalResource) {
        return originalResource;
      }
      if (session.sources.previewUrl) {
        return {
          kind: "preview",
          url: session.sources.previewUrl,
          mimeType: "",
          processedMeta: null,
          source: "preview"
        };
      }
      if (session.sources.currentBlobUrl) {
        return {
          kind: "blob",
          url: session.sources.currentBlobUrl,
          mimeType: "",
          processedMeta: null,
          source: "blob"
        };
      }
      return null;
    }
    function getPreferredElement(sessionKey, action = "display") {
      const session = getSession(sessionKey);
      if (!session) {
        return null;
      }
      const preferredResource = getBestResource(sessionKey, action);
      const preferredProcessedUrl = preferredResource?.kind === "processed" ? preferredResource.url || "" : "";
      const orderedSurfaces = ["preview", "fullscreen", "unknown"];
      for (const surface of orderedSurfaces) {
        const preferredElement = findPreferredSurfaceElement(
          session.surfaces?.[surface] || [],
          preferredProcessedUrl
        );
        if (preferredElement) {
          return preferredElement;
        }
      }
      return null;
    }
    function getSnapshot(sessionKey) {
      const session = getSession(sessionKey);
      if (!session) {
        return null;
      }
      return {
        sessionKey: session.sessionKey,
        assetIds: session.assetIds ? { ...session.assetIds } : null,
        sources: { ...session.sources },
        derived: {
          ...session.derived,
          processedSlots: {
            preview: {
              ...session.derived.processedSlots.preview,
              blob: session.derived.processedSlots.preview.blob || null
            },
            full: {
              ...session.derived.processedSlots.full,
              blob: session.derived.processedSlots.full.blob || null
            }
          }
        },
        state: { ...session.state },
        surfaces: {
          previewCount: session.surfaces.preview.size,
          fullscreenCount: session.surfaces.fullscreen.size,
          unknownCount: session.surfaces.unknown.size
        },
        timestamps: { ...session.timestamps }
      };
    }
    return {
      buildSessionKey: buildImageSessionKey,
      getOrCreateByAssetIds,
      getByAssetIds,
      getSnapshot,
      getBestResource,
      getPreferredElement,
      attachElement,
      detachElement,
      updateOriginalSource,
      updateSourceSnapshot,
      updateProcessedResult,
      markProcessing
    };
  }
  var defaultImageSessionStore = createImageSessionStore();
  function getDefaultImageSessionStore() {
    return defaultImageSessionStore;
  }

  // src/shared/originalBlob.js
  function shouldFetchBlobDirectly(sourceUrl) {
    return typeof sourceUrl === "string" && (sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:"));
  }
  function isRuntimeBlobUrl(sourceUrl) {
    return typeof sourceUrl === "string" && sourceUrl.startsWith("blob:");
  }
  function shouldPreferRenderedCapture(sourceUrl) {
    return isGeminiPreviewAssetUrl(sourceUrl);
  }
  async function captureRenderedBlob({
    image,
    captureRenderedImageBlob
  }) {
    if (typeof captureRenderedImageBlob !== "function") {
      throw new Error("Rendered capture unavailable");
    }
    return captureRenderedImageBlob(image);
  }
  async function acquireOriginalBlob({
    sourceUrl,
    image,
    fetchBlobFromBackground: fetchBlobFromBackground2,
    fetchBlobDirect: fetchBlobDirect2,
    captureRenderedImageBlob,
    validateBlob,
    preferRenderedCaptureForPreview = true,
    preferRenderedCaptureForBlobUrl = false,
    allowRenderedCaptureFallbackOnValidationFailure = true
  }) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
    if (preferRenderedCaptureForPreview && shouldPreferRenderedCapture(normalizedSourceUrl)) {
      return captureRenderedBlob({
        image,
        captureRenderedImageBlob
      });
    }
    if (preferRenderedCaptureForBlobUrl && isRuntimeBlobUrl(normalizedSourceUrl)) {
      return captureRenderedBlob({
        image,
        captureRenderedImageBlob
      });
    }
    if (isGeminiGeneratedAssetUrl(normalizedSourceUrl)) {
      const blob = await fetchBlobFromBackground2(normalizedSourceUrl);
      if (typeof validateBlob === "function") {
        try {
          await validateBlob(blob);
        } catch (error) {
          if (!allowRenderedCaptureFallbackOnValidationFailure) {
            throw error;
          }
          return captureRenderedBlob({
            image,
            captureRenderedImageBlob
          });
        }
      }
      return blob;
    }
    if (shouldFetchBlobDirectly(normalizedSourceUrl)) {
      return fetchBlobDirect2(normalizedSourceUrl);
    }
    return captureRenderedBlob({
      image,
      captureRenderedImageBlob
    });
  }

  // src/shared/domAdapter.js
  var GEMINI_IMAGE_CONTAINER_SELECTOR = "generated-image,.generated-image-container";
  var GEMINI_FULLSCREEN_CONTAINER_SELECTOR = 'expansion-dialog,[role="dialog"],.image-expansion-dialog-panel,.cdk-overlay-pane';
  var GEMINI_UPLOADER_PREVIEW_SELECTOR = '[data-test-id="image-preview"],uploader-file-preview,uploader-file-preview-container,.attachment-preview-wrapper,.file-preview-container';
  var MIN_GEMINI_IMAGE_EDGE = 128;
  var MAX_CONTAINER_SEARCH_DEPTH = 4;
  var MIN_ACTION_BUTTONS = 3;
  var GEMINI_DRAFT_ID_ATTRIBUTE = "data-test-draft-id";
  function normalizeGeminiAssetId(value, prefix) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith(prefix) || trimmed.length <= prefix.length) {
      return null;
    }
    return trimmed;
  }
  function parseGeminiAssetIdsFromJslog(jslog = "") {
    if (typeof jslog !== "string" || jslog.length === 0) {
      return null;
    }
    const responseId = normalizeGeminiAssetId(jslog.match(/"((?:r|resp)_[^"]+)"/)?.[1] || null, "r_");
    const conversationId = normalizeGeminiAssetId(jslog.match(/"((?:c|conv)_[^"]+)"/)?.[1] || null, "c_");
    const draftId = normalizeGeminiAssetId(jslog.match(/"((?:rc|draft)_[^"]+)"/)?.[1] || null, "rc_");
    if (!responseId && !conversationId && !draftId) {
      return null;
    }
    return {
      responseId,
      draftId,
      conversationId
    };
  }
  function getAttributeValue(element, attributeName) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }
    return String(element.getAttribute(attributeName) || "").trim();
  }
  function getClosestElement(element, selector) {
    if (!element || typeof element.closest !== "function") {
      return null;
    }
    return element.closest(selector);
  }
  function collectGeminiMetadataElements(img) {
    const elements = [];
    const seen = /* @__PURE__ */ new Set();
    const pushElement = (element) => {
      if (!element || typeof element !== "object" || seen.has(element)) return;
      seen.add(element);
      elements.push(element);
    };
    pushElement(img);
    pushElement(getClosestElement(img, "single-image"));
    pushElement(getClosestElement(img, `[${GEMINI_DRAFT_ID_ATTRIBUTE}]`));
    pushElement(getClosestElement(img, GEMINI_IMAGE_CONTAINER_SELECTOR));
    let current = img?.parentElement || null;
    let depth = 0;
    while (current && depth < MAX_CONTAINER_SEARCH_DEPTH) {
      pushElement(current);
      current = current.parentElement || null;
      depth += 1;
    }
    return elements;
  }
  function getMediaEdgeSize(element) {
    const naturalWidth = Number(element?.naturalWidth) || 0;
    const naturalHeight = Number(element?.naturalHeight) || 0;
    const width = Number(element?.width) || 0;
    const height = Number(element?.height) || 0;
    const clientWidth = Number(element?.clientWidth) || 0;
    const clientHeight = Number(element?.clientHeight) || 0;
    return {
      width: Math.max(naturalWidth, width, clientWidth),
      height: Math.max(naturalHeight, height, clientHeight)
    };
  }
  function hasAnyGeminiAssetIds(assetIds) {
    return Boolean(assetIds?.responseId || assetIds?.draftId || assetIds?.conversationId);
  }
  function isBlobOrDataImageSource(sourceUrl) {
    return sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:");
  }
  function isInsideGeminiFullscreenContainer(img) {
    return Boolean(getClosestElement(img, GEMINI_FULLSCREEN_CONTAINER_SELECTOR));
  }
  function isGeminiUploaderPreviewImage(img) {
    return Boolean(getClosestElement(img, GEMINI_UPLOADER_PREVIEW_SELECTOR));
  }
  function resolveCandidateImageUrl(img) {
    if (!img || typeof img !== "object") return "";
    if (img?.dataset?.gwrPreviewImage === "true") return "";
    const explicitSource = typeof img?.dataset?.gwrSourceUrl === "string" ? img.dataset.gwrSourceUrl.trim() : "";
    if (explicitSource) return explicitSource;
    const stableSource = typeof img?.dataset?.gwrStableSource === "string" ? img.dataset.gwrStableSource.trim() : "";
    if (stableSource) {
      const currentSrc2 = typeof img?.currentSrc === "string" ? img.currentSrc.trim() : "";
      const src2 = typeof img?.src === "string" ? img.src.trim() : "";
      if (currentSrc2.startsWith("blob:") || currentSrc2.startsWith("data:") || src2.startsWith("blob:") || src2.startsWith("data:")) {
        return stableSource;
      }
    }
    const currentSrc = typeof img?.currentSrc === "string" ? img.currentSrc.trim() : "";
    if (currentSrc) return currentSrc;
    const src = typeof img?.src === "string" ? img.src.trim() : "";
    return src;
  }
  function isProcessableGeminiImageElement(img) {
    if (!img || typeof img.closest !== "function") return false;
    if (img?.dataset?.gwrPreviewImage === "true") return false;
    if (isGeminiUploaderPreviewImage(img)) return false;
    const knownContainer = img.closest(GEMINI_IMAGE_CONTAINER_SELECTOR);
    const sourceUrl = resolveCandidateImageUrl(img);
    if (isGeminiGeneratedAssetUrl(sourceUrl)) {
      if (knownContainer) return true;
      return hasMeaningfulGeminiImageSize(img);
    }
    if (knownContainer && isBlobOrDataImageSource(sourceUrl)) {
      if (isInsideGeminiFullscreenContainer(img)) {
        return true;
      }
      if (hasAnyGeminiAssetIds(extractGeminiImageAssetIds(img))) {
        return true;
      }
    }
    return shouldUseRenderedImageFallback(img);
  }
  function getGeminiImageContainerSelector() {
    return GEMINI_IMAGE_CONTAINER_SELECTOR;
  }
  function getGeminiImageQuerySelector() {
    return GEMINI_IMAGE_CONTAINER_SELECTOR.split(",").map((selector) => `${selector.trim()} img`).join(",");
  }
  function hasMeaningfulGeminiImageSize(img) {
    const { width, height } = getMediaEdgeSize(img);
    return width >= MIN_GEMINI_IMAGE_EDGE || height >= MIN_GEMINI_IMAGE_EDGE;
  }
  function getPreferredGeminiImageContainer(img) {
    if (!img || typeof img !== "object") return null;
    const knownContainer = typeof img.closest === "function" ? img.closest(GEMINI_IMAGE_CONTAINER_SELECTOR) : null;
    if (knownContainer) return knownContainer;
    let current = img.parentElement || null;
    let depth = 0;
    while (current && depth < MAX_CONTAINER_SEARCH_DEPTH) {
      if (current.tagName && current.tagName !== "IMG") {
        return current;
      }
      current = current.parentElement || null;
      depth += 1;
    }
    return img.parentElement || null;
  }
  function extractGeminiImageAssetIds(img) {
    const assetIds = {
      responseId: null,
      draftId: null,
      conversationId: null
    };
    if (!img || typeof img !== "object") {
      return assetIds;
    }
    const responseIdFromDataset = normalizeGeminiAssetId(
      typeof img?.dataset?.gwrResponseId === "string" ? img.dataset.gwrResponseId : null,
      "r_"
    );
    if (responseIdFromDataset) {
      assetIds.responseId = responseIdFromDataset;
    }
    const draftIdFromDataset = normalizeGeminiAssetId(
      typeof img?.dataset?.gwrDraftId === "string" ? img.dataset.gwrDraftId : null,
      "rc_"
    );
    if (draftIdFromDataset) {
      assetIds.draftId = draftIdFromDataset;
    }
    const conversationIdFromDataset = normalizeGeminiAssetId(
      typeof img?.dataset?.gwrConversationId === "string" ? img.dataset.gwrConversationId : null,
      "c_"
    );
    if (conversationIdFromDataset) {
      assetIds.conversationId = conversationIdFromDataset;
    }
    for (const element of collectGeminiMetadataElements(img)) {
      if (!assetIds.draftId) {
        assetIds.draftId = normalizeGeminiAssetId(
          getAttributeValue(element, GEMINI_DRAFT_ID_ATTRIBUTE),
          "rc_"
        );
      }
      const parsed = parseGeminiAssetIdsFromJslog(getAttributeValue(element, "jslog"));
      if (!parsed) continue;
      assetIds.responseId ||= parsed.responseId;
      assetIds.draftId ||= parsed.draftId;
      assetIds.conversationId ||= parsed.conversationId;
      if (assetIds.responseId && assetIds.draftId && assetIds.conversationId) {
        break;
      }
    }
    return assetIds;
  }
  function hasNearbyActionCluster(img) {
    let current = img?.parentElement || null;
    let depth = 0;
    while (current && depth < MAX_CONTAINER_SEARCH_DEPTH) {
      const buttons = typeof current.querySelectorAll === "function" ? current.querySelectorAll('button,[role="button"]') : [];
      if ((buttons?.length || 0) >= MIN_ACTION_BUTTONS) {
        return true;
      }
      current = current.parentElement || null;
      depth += 1;
    }
    return false;
  }
  function shouldUseRenderedImageFallback(img) {
    return hasMeaningfulGeminiImageSize(img) && hasNearbyActionCluster(img);
  }

  // src/core/embeddedAlphaMaps.js
  var EMBEDDED_ALPHA_MAP_LENGTHS = {
    48: 48 * 48,
    96: 96 * 96
  };
  var EMBEDDED_ALPHA_MAP_BASE64 = {
    48: "gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAADj4uI+4eDgPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDvBwEA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4WEBD6BgAA/gYAAP4GAAD4AAAAAgYAAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8wcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYAAPIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO5GQkD6BgAA/gYAAP5GQkD4AAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADwAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAO+Hg4D6BgAA/gYAAP/Hw8D4AAAAAgYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPoGAAD+BgAA/gYAAP4GAAD+BgAA+AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAADwAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7AAAAAAAAAACBgIA7oaCgPoGAAD+BgAA/gYAAP4GAAD/BwMA+AAAAAAAAAACBgIA7AAAAAIGAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAwcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADwAAAAAAAAAAIGAADyJiIg9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgIA7AAAAAAAAAAAAAAAAgYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAADwAAAAAgYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO8HAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/o6KiPoGAgDuBgAA8AAAAAIGAgDuBgIA7gYCAO8HAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPAAAAAAAAAAAgYCAO4GAADyBgIA7gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAADyBgAA8gYCAO4mIiD2BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD6BgAA8gYCAO4GAADwAAAAAgYCAO4GAADyBgIA7wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7AAAAAIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO+Hg4D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDsAAAAAAAAAAIGAgDuBgAA8AAAAAIGAgDuBgIA7AAAAAAAAAAAAAAAAgYAAPIGAgDuBgIA7gYAAPAAAAACBgIA7gYCAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4GA+AAAAAAAAAACBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAACBgIA7gYCAO8HAQDwAAAAAgYCAO4GAADwAAAAAgYAAPAAAAACBgAA8gYCAOwAAAACBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+wcDAPYGAgDuBgAA8wcBAPIGAADyBgAA8gYAAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAACBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7AAAAAMHAQDyBgAA8gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAAD2BgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAOwAAAACBgIA7AAAAAAAAAACBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO9PS0j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPIGAgDuBgIA7o6KiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+hoKA+gYCAOwAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPgAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAADwAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPcHAwD6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgIA9gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgIA7gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAADBwMA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+iYiIPYGAgDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAOHgYD7x8PA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4WEhD6BgIA7gYCAO4GAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAgDsAAAAAgYAAPIGAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAgDuBgAA+wcDAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAPYGAADzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6GgoD6BgIA9gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4WEBD7BwMA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAAD6BgIA7gYAAPIGAgDuBgIA7AAAAAIGAAD6RkJA+8fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+kZCQPoGAAD6BgIA84eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAO4GAAD6RkJA+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+kZCQPoGAAD6BgIA7gYCAO8HAQDwAAAAAgYCAO4GAAD6hoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/wcDAPoGAAD6BgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA7AAAAAAAAAACBgAA8gYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6Oioj6JiIg9gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO4GAADyBgIA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/BwMA+gYAAPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/8/LyPuXkZD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAAAAAAAAAAAAgYAAPAAAAACBgIA94+LiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+wcDAPYGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPdHQ0D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA9gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgIA7gYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/oaCgPsHAQDzBwEA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7gYCAO4GAADyBgIA7oaCgPoGAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8PCwj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgAA8gYAAPMHAQDzBwEA8gYCAOwAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYCAO6GgID3j4uI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAgD2BgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYCAPMHAQDwAAAAAgYCAO8HAQDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8AAAAAAAAAACBgAA8wcBAPIGAADzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADzJyMg98fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgAA8wcBAPIGAADyBgIA7AAAAAAAAAACBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA84eBgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYCAO4GAgDvBwEA8gYAAPIGAgDsAAAAAgYCAO4GAgDvBwEA8wcBAPIGAgDuBgAA8gYCAOwAAAAAAAAAAAAAAAIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYAAPIGAADyBgAA8AAAAAMHAwD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgAA8gYCAO4GAAD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAgD2BgIA7gYCAOwAAAACBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAOwAAAACBgAA8gYAAPIGAADyBgIA7gYCAOwAAAAChoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPYGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAw8LCPoKBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDuBgIA7gYAAPMHAQDyBgIA7gYAAPoKBAT+BgAA/gYAAP4GAAD+BgAA+gYCAO4GAADyBgAA8AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPAAAAAAAAAAAgYAAPIGAADyBgIA7gYCAO/Py8j6BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAADzBwEA8gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO5OSkj6BgAA/gYAAP5OSkj6BgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADyBgIA7AAAAAIGAgDvBwEA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYAAPIGAAD6BgAA/gYAAP4WEBD6BgIA7gYCAO4GAADyBgAA8gYAAPIGAADwAAAAAgYCAOwAAAACBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8gYAAPIGAgDvh4OA+4eDgPoGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7",
    96: "gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDwAAAAAwcBAPMHAQDyBgIA8wcBAPIGAADyhoKA8gYAAPIGAADyBgAA8AAAAAIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAADzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPOXkZD7z8vI+4+LiPu3sbD6BgIA7wcBAPAAAAACBgAA8gYCAO4GAADyBgIA8gYCAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAO8HAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8oaCgPIGAgDyBgIA8wcBAPIGAgDyBgAA8wcBAPIGAgDvBwEA8wcBAPIGAgDyBgAA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAADzBwEA8wcBAPIGAgDvBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPYGAAD+BgAA/goEBP4KBAT+RkBA9gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYAAPAAAAACBgAA8AAAAAIGAgDuBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcDAPKGgoDyBgIA8oaCgPIGAgDyhoKA8gYCAOwAAAACBgAA8gYCAO4GAADyBgIA8wcBAPIGAADwAAAAAgYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8AAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAADyBgAA8paQkPoGAAD+BgAA/goEBP4GAAD/FxEQ+AAAAAAAAAACBgIA7gYAAPIGAgDsAAAAAAAAAAIGAgDuBgIA7gYAAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYAAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPKGgoDzBwEA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDyBgIA8gYCAPMHAQDzBwEA8AAAAAIGAgDuBgIA7gYAAPIGAADyhoKA8gYAAPMHAQDwAAAAAgYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAADyBgIA7gYCAOwAAAACBgIA7gYCAPMHAQDyBgAA8gYCAPIGAgDuBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPIGAADzBwEA8paSkPoGAAD+BgAA/goEBP4KBAT+hoKA+gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAAAAAAIGAgDuBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8oaCgPIGAgDyBgAA8gYCAO8HAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPMHAQDyhoKA8gYCAPMHAQDzBwEA8AAAAAAAAAACBgIA7wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAADBwEA8gYCAO8HAQDzBwEA8AAAAAIGAADyBgIA7gYCAOwAAAACBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgIA8wcBAPAAAAACBgIA7AAAAAIGAgDvBwEA85eTkPoGAAD+BgAA/gYAAP4GAAD/z8vI+gYAAPMHAQDyBgIA7gYAAPMHAQDyBgIA7gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYCAO8HAQDyBgIA8oaCgPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDsAAAAAwcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPKGgoDyBgIA8oaCgPIGAgDzBwEA8gYCAOwAAAADBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAgDyBgIA8AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDuBgIA8oaCgPIGAADyBgIA8AAAAAIGAADyBgIA8gYAAPIGAADyFhAQ+goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/iYgIPoGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAADyBgIA7gYCAO4GAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAADyBgIA7gYCAPIGAADyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADylpKQ+goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/k5KSPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADzBwEA8wcBAPKGgoDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwMA8oaCgPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA8gYCAO4GAgDsAAAAAgYAAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDvj4uI+goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/8/LyPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYCAO8HAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDzBwEA8oaCgPKGgoDyBgIA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA8gYCAO4GAgDuBgAA8wcBAPIGAgDyBgIA7gYAAPIGAADyBgAA8gYAAPAAAAACBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPKmoKD6BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4WEBD7BwEA8gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgIA8gYAAPIGAgDsAAAAAgYCAO4GAgDuBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgIA8oaCgPIGAgDyBgAA8gYAAPIGAgDyBgIA8oaCgPIGAgDyBgIA8gYCAO8HAQDyBgIA7gYCAOwAAAACBgIA7wcBAPIGAADyBgIA7wcBAPIGAgDuBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPLOysj6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP8PCwj6BgAA8AAAAAIGAgDvBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDsAAAAAgYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYCAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyhoKA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcDAPIGAgDyBgIA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO8HAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4GAADyBgIA8iYiIPYGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+JiIg9gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAgDsAAAAAgYAAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAADzBwEA8oaCgPoGAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+FhIQ+gYAAPIGAADyBgIA7AAAAAIGAADyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA7wcBAPIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8gYCAO4GAgDuBgIA7gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8AAAAAAAAAACBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgAA8gYCAOwAAAADBwEA8wcBAPMHAQDwAAAAAAAAAAIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADyBgIA7gYAAPAAAAAAAAAAAgYAAPAAAAACJiIg9goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD/z8vI+gYAAPYGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAOwAAAADBwEA8gYAAPIGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPMHAwDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAADwAAAAAgYAAPIGAgDsAAAAAgYAAPMHAQDyBgAA8gYCAOwAAAACBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8wcBAPAAAAAAAAAAAgYCAO4GAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7gYAAPMHAQDyDgoI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4KCPoGAADyBgAA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPKGgoDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDvBwEA8gYCAPAAAAAAAAAAAgYCAO4GAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDwAAAAAgYCAOwAAAACBgIA7AAAAAAAAAACBgIA8gYCAPJGQkD3j4uI+goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/8/LyPpGQED2BgAA8oaCgPIGAgDyBgIA8wcBAPIGAADyBgIA8gYCAPIGAADzBwEA8gYAAPIGAgDyBgIA7wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYCAPKGgoDzBwMA8gYCAPIGAADyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8wcBAPIGAgDuBgAA8gYCAO4GAgDsAAAAAgYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAO4GAADyBgIA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYCAPKWkpD6CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP4KBAT+CgQE/goEBP4WEhD7BwEA8gYCAO8HAQDyBgIA8gYAAPMHAQDzBwMA8wcBAPIGAADyBgIA7gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAwDzBwEA8gYCAPIGAADyhoKA8wcBAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgAA8gYAAPAAAAACBgIA7gYAAPIGAgDuBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP/Py8j6JiIg9wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAO4GAADzBwEA8gYCAOwAAAACBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8paSkPoKBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+zsrI+gYCAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYCAO8HAQDyBgIA8gYCAOwAAAADBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA8gYAAPIGAgDuBgIA7AAAAAIGAADzBwEA8oaCgPIGAgDzBwEA8gYCAO8HAQDyBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDylpCQ+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4SDAz+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/iYgIPoGAgDuBgIA7gYAAPIGAgDyBgAA8gYCAO4GAADyBgAA8AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDyBgIA8gYAAPIGAgDzBwEA8gYAAPMHAQDyhoKA8oaCgPIGAgDyBgAA8gYCAOwAAAADBwEA8gYCAPIGAgDzBwEA8gYCAO4GAADyBgAA8gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYCAPIGAADyBgAA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzj4uI+goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/gYAAP4GAAD+CgQE/4+LiPpGQED3BwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYAAPIGAgDvBwEA8gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8gYCAPIWEhD6BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP5OSkj6BgAA8wcBAPMHAQDyBgAA8gYCAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgIA8gYCAPIGAADyBgIA8oaCgPIGAgDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8oaCgPIGAADyBgAA8gYCAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8AAAAAMHAQDyBgIA82djYPYKBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+DggI/goEBP4GAAD+FhAQ+wcBAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDsAAAAAAAAAAAAAAAChoKA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDyBgAA8gYCAPMHAQDyBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDwAAAAAgYCAO4GAADyJiIg95eTkPoKBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD/j4uI+sbAwPYGAgDyhoKA8oaCgPMHAQDyBgAA8AAAAAIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8oaCgPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAIGAgDvBwEA8gYCAPIGAADyBgIA7gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyjoqI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPsHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAADyBgIA8wcBAPKGgoDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgAA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgAA8wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA8wcBAPIWEhD6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+XkZD6BgAA8gYCAO4GAgDyBgIA8gYCAO8HAQDyBgIA8gYAAPMHAQDyBgIA7gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPIGAADzBwEA8gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDsAAAAAwcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8jYwMPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgIA8gYCAO4GAADyhoKA8wcBAPIGAgDyBgIA8gYCAO4GAgDyBgIA8gYCAPIGAgDyBgAA8oaCgPIGAgDzBwEA8gYCAPKGgoDzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYCAO4GAADyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAADzBwEA8gYAAPIGAgDsAAAAAwcBAPIGAADyJiIg98/LyPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD/x8PA+kZCQPYGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPIGAgDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAO8HAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPKGgoDzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgDvBwEA8wcBAPMHAQDwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/4+LiPomIiD3BwEA8gYCAO4GAgDuBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDyBgIA7gYAAPMHAQDyBgIA8oaCgPMHAQDzBwEA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgIA8gYAAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDzBwEA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgIA7wcBAPIGAgDsAAAAAgYCAO4GAADzBwEA8kZCQPePi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP+Pi4j6BgIA9gYCAO4GAgDuhoKA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDwAAAAAgYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADyxsDA94+LiPoKBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/T0tI+gYAAPcHAQDyBgAA8gYCAPIGAgDsAAAAAgYCAO8HAQDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDyBgAA8gYCAPMHAQDyBgAA8gYCAO8HAQDwAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAOwAAAACBgAA8gYCAO4GAgDuBgAA8gYAAPJmYmD3V1NQ+gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/4+LiPqGgoD2BgIA8wcDAPIGAADyBgAA8gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA7gYCAPIGAgDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDyhoKA8oaCgPMHAQDzBwEA8gYCAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYCAO8HAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA7kZCQPeXk5D6CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4OCAj+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+BgAA/gYAAP+Pi4j6JiIg9gYAAPAAAAAAAAAAAwcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgIA7wcBAPIGAADyBgIA7gYAAPIGAgDzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADyRkJA95eTkPoKBAT+CgQE/g4ICP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD/j4uI+gYCAPYGAgDuBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDzBwEA8wcBAPKGgoDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA7AAAAAMHAQDzBwEA8gYCAO4GAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgIA7AAAAAIGAADyBgAA8oaCgPMHAQDyBgIA7gYCAO4mICD7z8vI+gYAAP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/8fDwPoWEBD6BgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcDAPKGgoDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgIA8wcBAPMHAQDyBgIA75eRkPoKBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgAA8wcBAPMHAwDyhoKA8gYCAPMHAQDwAAAAAgYCAO4GAgDyBgIA8gYAAPIGAADyBgIA7gYCAPIGAADyBgIA7wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8wcBAPIGAAD2xsLA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/o6KiPpGQkD3BwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADzBwEA8iYgIPuHg4D6BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP+Pi4j7R0NA9wcBAPIGAgDuBgIA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAOwAAAACBgAA8wcBAPMHAQDyBgIA7gYAAPIGAgDyhoKA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAAD2TkpI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/hYSEPsHAQDyBgAA8gYCAO4GAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYCAPKGgoDzBwEA8gYCAOwAAAADBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8iYgIPuPi4j6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Xk5D6pqCg+gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPIGAADyBgIA8wcBAPImIiD2zsrI+gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4ICP4KBAT+DggI/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/paSkPomIiD3BwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADzBwEA8wcDAPIGAgDzBwEA8gYCAPIGAgDuBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA9g4KCPvPy8j6CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+lpKQ+kZCQPYGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgAA8wcBAPIGAADyBgAA8kZAQPYWEhD7z8vI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/4+LiPoWEhD6ZmJg9gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA7AAAAAIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgD2FhIQ+8/LyPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/o6KiPomIiD2BgAA8gYCAPIGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAADyFhAQ+w8LCPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4SDAz+BgAA/g4ICP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+xsLA+paQkPsHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA+kZCQPvPy8j6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/g4ICP+Pi4j6joqI+kZAQPoGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPKGgID3FxEQ+o6KiPvPy8j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4OCAj+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP+Xk5D6lpKQ+rawsPpGQkD2BgAA86ehoPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/p6Gg+4+LiPoKBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT/z8vI+8/LyPoKBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT/l5OQ+6ehoPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT/t7Gw+wcBAPKmoqD2hoCA+paSkPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP/X09D6joqI+xcREPpGQED2BgAA8wcBAPIGAgDzBwEA8wcBAPIGAADyFhAQ+oaCgPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP/Py8j6VlJQ+iYgIPoGAgDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADylpCQ+tbS0PoGAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT/DwsI+iYgIPoGAgDyhoKA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgD2joqI+gYAAP4GAAD+BgAA/g4ICP4OCAj+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/z8vI+hYSEPpmYmD3BwEA8wcBAPMHAwDzBwMA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8kZCQPYWEhD7j4uI+goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/8/LyPoOCgj6RkBA9gYAAPIGAADyBgAA8gYCAPIGAgDyhoKA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgAA8gYCAPIGAADzBwEA8gYCAPKGgoDyBgIA8gYAAPMHAQDyhoKA8oaCgPIGAADzBwEA8gYAAPIGAgDyBgIA9o6KiPoKBAT+BgAA/gYAAP4KBAT+DggI/g4ICP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP/X09D6FhIQ+oaAgPYGAgDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgAA8gYAAPIGAADwAAAAAgYAAPImIiD2npqY+gYAAP4KBAT+DggI/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPpGQkD2BgIA8wcBAPMHAQDyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAgDuBgIA7gYCAO4GAADwAAAAAgYCAO8HAQDzBwEA8oaAgPuHg4D6BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP+Xk5D6JiAg+gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPKGgoDyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADyBgAA8AAAAAIGAADyDgoI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/lZSUPrGwMD3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDzBwEA8gYCAO8HAQDyBgIA7gYAAPIGAgDuBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDwAAAAAgYAAPAAAAACBgAA8gYCAO4GAgDsAAAAAwcDAPePi4j6CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP+Pi4j6JiAg+wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPKGgoDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgAA8AAAAAAAAAADBwEA8gYCAO4mIiD2joqI+goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/s7KyPqGgID3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA8gYAAPIGAgDuBgIA8hYSEPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/l5GQ+wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYAAPImICD7z8vI+goEBP4GAAD+CgQE/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/8fDwPomICD7BwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAADzBwEA8gYCAPMHAQDyZmJg94+LiPoGAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD/j4uI+iYiIPcHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8kZCQPePi4j6CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYAAPIGAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA8oaCgPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA8gYAAPIGAADyBgIA7gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYAAPMHAQDzBwEA8wcBAPJGQkD3j4uI+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4OCAj+CgQE/g4ICP4OCAj+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/09LSPpGQkD3BwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8oaCgPMHAQDyBgIA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyhoCA909LSPoKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT/j4uI+sbAwPYGAgDyBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDyhoKA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYAAPIGAgDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8mZiYPeXk5D6CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+DggI/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgIA7wcBAPMHAQDzBwEA8wcBAPJGQkD3j4uI+g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4GAAD+DggI/4+LiPpGQkD2BgAA8gYAAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyJiIg98/LyPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT/19PQ+kZCQPYGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPKGgoDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA7hYQEPoKBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4KBAT+NjAw+oaCgPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPKGgoDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8gYCAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYAAPOXkZD6BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCgj6BgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPKGgoDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAwDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDyhoKA8oaCgPKGgoDyBgIA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADyBgAA8gYCAO8HAQDyzsrI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPMHAQDyBgAA8gYCAO4GAADyBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDuhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPMHAQDwAAAAAwcBAPMHAQDyBgAA8gYCAPIGAgDyhoKA8oaCgPKGgoDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYAAPMHAQDyBgIA7gYAAPMHAQDyBgAA94eDgPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+kZCQPYGAADyBgIA7wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA7wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDvBwEA8gYAAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAPMHAQDyBgIA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT/R0NA9gYCAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPJOSkj6BgAA/gYAAP4KBAT+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4WEhD6BgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYAAPIGAgDyBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgAA8gYAAPMHAQDyBgIA7wcBAPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8oaCgPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAO5GQED3j4uI+gYAAP4OCAj+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/5eTkPoGAgDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDyhoKA8gYCAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA8gYAAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyJiAg+goEBP4KBAT+DggI/goEBP4OCAj+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/qagoPoGAADyBgAA8gYAAPIGAADyBgIA8gYCAPIGAADyBgIA8gYCAO8HAQDyBgAA8wcBAPIGAADyBgAA8gYCAPIGAADyBgIA7gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA7wcBAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDvBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADzBwEA8wcBAPAAAAACBgAA8gYCAO4GAADyBgIA7s7KyPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+lpKQ+gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA8wcBAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyBgAA8iYiIPfHw8D6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+JiIg9wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDyhoKA8wcBAPMHAQDyBgAA8gYCAPMHAQDyhoKA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDvBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIOCgj6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP6WkpD6BgIA8gYCAPIGAgDzBwEA8wcBAPKGgoDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgIA8wcBAPIGAgDyBgAA8gYCAPIGAADyBgAA8AAAAAIGAADyBgAA8wcBAPIGAADyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYCAPJGQED3z8vI+gYAAP4GAAD+DggI/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+CgQE/4+LiPpmYmD3BwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8gYAAPKGgoDzBwEA8gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8AAAAAMHAQDzBwEA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyDgoI+goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/g4KCPsHAQDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPKGgoDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAADyBgAA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAADyBgAA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8oaCgPIGAgDzBwEA8gYCAPIGAADyhoCA98/LyPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/mZiYPYGAADyBgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDvBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8hYSEPoKBAT+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+lpKQ+gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAgDuBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDzBwMA8wcBAPMHAQDzBwEA8AAAAAIGAADzBwEA8AAAAAIGAADyBgIA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPMHAQDyBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+RkJA9wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8wcBAPKGgoDzBwEA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgIA8gYAAPIGAADyBgIA7gYCAO4GAgDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDvBwEA8gYAAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDyBgAA8AAAAAIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMPCwj6BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP7Oysj6BgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8oaCgPKGgoDyBgIA8gYCAPIGAgDvBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDvBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAAD6BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP6WkJD7BwEA8wcBAPIGAADyBgAA8gYCAPKGgoDyBgIA7wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAgDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgIA8oaCgPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyhoKA8wcBAPMHAQDzz8vI+goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/4+LiPoGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDyBgAA8gYCAPIGAgDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADyBgAA8wcBAPAAAAADBwEA8wcBAPIGAgDuBgIA7gYAAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyVlJQ+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/paSkPoGAgDyBgIA8wcBAPMHAQDyhoKA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYCAPIGAADzBwEA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA8wcBAPIGAADwAAAAAgYAAPIGAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyJiAg+goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/iYgIPoGAADyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADyhoKA8gYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYAAPAAAAACBgAA8gYCAO4GAgDvBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDyhoKA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgAA8AAAAAIGAgDuBgIA8wcBAPAAAAACBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA8gYCAO8HAQDyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA88/LyPoGAAD+CgQE/goEBP4KBAT/j4uI+gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPKGgoDyBgIA8gYCAPIGAgDyBgIA7gYCAO8HAQDyBgAA8gYAAPIGAADyBgIA7gYAAPIGAgDsAAAAAAAAAAMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPKGgoDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgAA8paSkPoKBAT+CgQE/goEBP4KBAT+hoKA+gYAAPMHAQDyhoKA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgIA8oaCgPIGAADyBgAA8gYAAPMHAQDzBwEA8oaCgPIGAgDyBgIA7gYCAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPIGAADyhoKA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8gYAAPIGAgDyBgIA8wcBAPMHAQDwAAAAAgYCAO8HAQDyBgAA8gYCAOwAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8xcREPoKBAT+CgQE/goEBP4KBAT+pqCg+wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8kZAQPYGAAD+CgQE/goEBP4KBAT+JiIg9gYCAPIGAgDyBgIA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDyBgIA7gYAAPAAAAACBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPKGgoDyBgAA8wcBAPIGAADzBwEA8AAAAAIGAADyBgIA7gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPOXkZD7h4OA+8/LyPunoaD7BwEA8gYCAPIGAgDzBwEA8gYAAPIGAgDvBwEA8wcBAPIGAADyBgIA8wcBAPIGAADyBgIA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAPMHAQDyBgIA7gYAAPIGAADyBgAA8"
  };
  var decodedAlphaMaps = /* @__PURE__ */ new Map();
  function decodeBase64(base64) {
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(base64, "base64"));
    }
    if (typeof atob !== "undefined") {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    throw new Error("No base64 decoder available in current runtime");
  }
  function getEmbeddedAlphaMap(size) {
    const knownSize = Number(size);
    if (!(knownSize in EMBEDDED_ALPHA_MAP_BASE64)) {
      return null;
    }
    if (!decodedAlphaMaps.has(knownSize)) {
      const bytes = decodeBase64(EMBEDDED_ALPHA_MAP_BASE64[knownSize]);
      const expectedLength = EMBEDDED_ALPHA_MAP_LENGTHS[knownSize];
      const view = new Float32Array(bytes.buffer, bytes.byteOffset, expectedLength);
      decodedAlphaMaps.set(knownSize, new Float32Array(view));
    }
    return new Float32Array(decodedAlphaMaps.get(knownSize));
  }

  // src/core/blendModes.js
  var ALPHA_NOISE_FLOOR = 3 / 255;
  var ALPHA_THRESHOLD = 2e-3;
  var MAX_ALPHA = 0.99;
  var LOGO_VALUE = 255;
  function removeWatermark(imageData, alphaMap, position, options = {}) {
    const { x, y, width, height } = position;
    const alphaGain = Number.isFinite(options.alphaGain) && options.alphaGain > 0 ? options.alphaGain : 1;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
        const alphaIdx = row * width + col;
        const rawAlpha = alphaMap[alphaIdx];
        const signalAlpha = Math.max(0, rawAlpha - ALPHA_NOISE_FLOOR) * alphaGain;
        if (signalAlpha < ALPHA_THRESHOLD) {
          continue;
        }
        const alpha = Math.min(rawAlpha * alphaGain, MAX_ALPHA);
        const oneMinusAlpha = 1 - alpha;
        for (let c = 0; c < 3; c++) {
          const watermarked = imageData.data[imgIdx + c];
          const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
          imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
        }
      }
    }
  }

  // src/core/geminiSizeCatalog.js
  var WATERMARK_CONFIG_BY_TIER = Object.freeze({
    "0.5k": Object.freeze({ logoSize: 48, marginRight: 32, marginBottom: 32 }),
    "1k": Object.freeze({ logoSize: 96, marginRight: 64, marginBottom: 64 }),
    "2k": Object.freeze({ logoSize: 96, marginRight: 64, marginBottom: 64 }),
    "4k": Object.freeze({ logoSize: 96, marginRight: 64, marginBottom: 64 })
  });
  function createEntries(modelFamily, resolutionTier, rows) {
    return rows.map(([aspectRatio, width, height]) => ({
      modelFamily,
      resolutionTier,
      aspectRatio,
      width,
      height
    }));
  }
  var OFFICIAL_GEMINI_IMAGE_SIZES = Object.freeze([
    ...createEntries("gemini-3.x-image", "0.5k", [
      ["1:1", 512, 512],
      ["1:4", 256, 1024],
      ["1:8", 192, 1536],
      ["2:3", 424, 632],
      ["3:2", 632, 424],
      ["3:4", 448, 600],
      ["4:1", 1024, 256],
      ["4:3", 600, 448],
      ["4:5", 464, 576],
      ["5:4", 576, 464],
      ["8:1", 1536, 192],
      ["9:16", 384, 688],
      ["16:9", 688, 384],
      ["21:9", 792, 168]
    ]),
    ...createEntries("gemini-3.x-image", "1k", [
      ["1:1", 1024, 1024],
      ["1:4", 512, 2064],
      ["1:8", 352, 2928],
      ["2:3", 848, 1264],
      ["3:2", 1264, 848],
      ["3:4", 896, 1200],
      ["4:1", 2064, 512],
      ["4:3", 1200, 896],
      ["4:5", 928, 1152],
      ["5:4", 1152, 928],
      ["8:1", 2928, 352],
      ["9:16", 768, 1376],
      ["16:9", 1376, 768],
      ["16:9", 1408, 768],
      ["21:9", 1584, 672]
    ]),
    ...createEntries("gemini-3.x-image", "2k", [
      ["1:1", 2048, 2048],
      ["1:4", 512, 2048],
      ["1:8", 384, 3072],
      ["2:3", 1696, 2528],
      ["3:2", 2528, 1696],
      ["3:4", 1792, 2400],
      ["4:1", 2048, 512],
      ["4:3", 2400, 1792],
      ["4:5", 1856, 2304],
      ["5:4", 2304, 1856],
      ["8:1", 3072, 384],
      ["9:16", 1536, 2752],
      ["16:9", 2752, 1536],
      ["21:9", 3168, 1344]
    ]),
    ...createEntries("gemini-3.x-image", "4k", [
      ["1:1", 4096, 4096],
      ["1:4", 2048, 8192],
      ["1:8", 1536, 12288],
      ["2:3", 3392, 5056],
      ["3:2", 5056, 3392],
      ["3:4", 3584, 4800],
      ["4:1", 8192, 2048],
      ["4:3", 4800, 3584],
      ["4:5", 3712, 4608],
      ["5:4", 4608, 3712],
      ["8:1", 12288, 1536],
      ["9:16", 3072, 5504],
      ["16:9", 5504, 3072],
      ["21:9", 6336, 2688]
    ]),
    ...createEntries("gemini-2.5-flash-image", "1k", [
      ["1:1", 1024, 1024],
      ["2:3", 832, 1248],
      ["3:2", 1248, 832],
      ["3:4", 864, 1184],
      ["4:3", 1184, 864],
      ["4:5", 896, 1152],
      ["5:4", 1152, 896],
      ["9:16", 768, 1344],
      ["16:9", 1344, 768],
      ["21:9", 1536, 672]
    ])
  ]);
  var OFFICIAL_GEMINI_IMAGE_SIZE_INDEX = new Map(
    OFFICIAL_GEMINI_IMAGE_SIZES.map((entry) => [`${entry.width}x${entry.height}`, entry])
  );
  function normalizeDimension(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.round(numeric);
    return rounded > 0 ? rounded : null;
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function getEntryConfig(entry) {
    return WATERMARK_CONFIG_BY_TIER[entry.resolutionTier] ?? null;
  }
  function buildConfigKey(config) {
    return `${config.logoSize}:${config.marginRight}:${config.marginBottom}`;
  }
  function matchOfficialGeminiImageSize(width, height) {
    const normalizedWidth = normalizeDimension(width);
    const normalizedHeight = normalizeDimension(height);
    if (!normalizedWidth || !normalizedHeight) return null;
    return OFFICIAL_GEMINI_IMAGE_SIZE_INDEX.get(`${normalizedWidth}x${normalizedHeight}`) ?? null;
  }
  function resolveOfficialGeminiWatermarkConfig(width, height) {
    const match = matchOfficialGeminiImageSize(width, height);
    if (!match) return null;
    return getEntryConfig(match);
  }
  function resolveOfficialGeminiSearchConfigs(width, height, {
    maxRelativeAspectRatioDelta = 0.02,
    maxScaleMismatchRatio = 0.12,
    minLogoSize = 24,
    maxLogoSize = 192,
    limit = 3
  } = {}) {
    const normalizedWidth = normalizeDimension(width);
    const normalizedHeight = normalizeDimension(height);
    if (!normalizedWidth || !normalizedHeight) return [];
    const exactOfficialConfig = resolveOfficialGeminiWatermarkConfig(
      normalizedWidth,
      normalizedHeight
    );
    if (exactOfficialConfig) {
      return [{ ...exactOfficialConfig }];
    }
    const targetAspectRatio = normalizedWidth / normalizedHeight;
    const candidates = OFFICIAL_GEMINI_IMAGE_SIZES.map((entry) => {
      const baseConfig = getEntryConfig(entry);
      if (!baseConfig) return null;
      const scaleX = normalizedWidth / entry.width;
      const scaleY = normalizedHeight / entry.height;
      const scale = (scaleX + scaleY) / 2;
      const entryAspectRatio = entry.width / entry.height;
      const relativeAspectRatioDelta = Math.abs(targetAspectRatio - entryAspectRatio) / entryAspectRatio;
      const scaleMismatchRatio = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY);
      if (relativeAspectRatioDelta > maxRelativeAspectRatioDelta) return null;
      if (scaleMismatchRatio > maxScaleMismatchRatio) return null;
      const config = {
        logoSize: clamp(Math.round(baseConfig.logoSize * scale), minLogoSize, maxLogoSize),
        marginRight: Math.max(8, Math.round(baseConfig.marginRight * scaleX)),
        marginBottom: Math.max(8, Math.round(baseConfig.marginBottom * scaleY))
      };
      const x = normalizedWidth - config.marginRight - config.logoSize;
      const y = normalizedHeight - config.marginBottom - config.logoSize;
      if (x < 0 || y < 0) return null;
      return {
        config,
        score: relativeAspectRatioDelta * 100 + scaleMismatchRatio * 20 + Math.abs(Math.log2(Math.max(scale, 1e-6)))
      };
    }).filter(Boolean).sort((a, b) => a.score - b.score);
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      const key = `${candidate.config.logoSize}:${candidate.config.marginRight}:${candidate.config.marginBottom}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(candidate.config);
      if (deduped.length >= limit) break;
    }
    return deduped;
  }
  function resolveGeminiWatermarkSearchConfigs(width, height, defaultConfig) {
    const configs = [];
    if (defaultConfig) {
      configs.push(defaultConfig);
    }
    configs.push(...resolveOfficialGeminiSearchConfigs(width, height));
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const config of configs) {
      if (!config) continue;
      const key = buildConfigKey(config);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(config);
    }
    return deduped;
  }

  // src/core/adaptiveDetector.js
  var DEFAULT_THRESHOLD = 0.35;
  var EPSILON = 1e-8;
  var clamp2 = (v, min, max) => Math.max(min, Math.min(max, v));
  function meanAndVariance(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    const mean = sum / values.length;
    let sq = 0;
    for (let i = 0; i < values.length; i++) {
      const d = values[i] - mean;
      sq += d * d;
    }
    return { mean, variance: sq / values.length };
  }
  function normalizedCrossCorrelation(a, b) {
    if (a.length !== b.length || a.length === 0) return 0;
    const statsA = meanAndVariance(a);
    const statsB = meanAndVariance(b);
    const den = Math.sqrt(statsA.variance * statsB.variance) * a.length;
    if (den < EPSILON) return 0;
    let num = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - statsA.mean) * (b[i] - statsB.mean);
    }
    return num / den;
  }
  function getRegion(data, width, x, y, size) {
    const out = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      const srcBase = (y + row) * width + x;
      const dstBase = row * size;
      for (let col = 0; col < size; col++) {
        out[dstBase + col] = data[srcBase + col];
      }
    }
    return out;
  }
  function toRegionGrayscale(imageData, region) {
    const { width, height, data } = imageData;
    const size = region.size ?? Math.min(region.width, region.height);
    if (!size || size <= 0) return new Float32Array(0);
    if (region.x < 0 || region.y < 0 || region.x + size > width || region.y + size > height) {
      return new Float32Array(0);
    }
    const out = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const idx = ((region.y + row) * width + (region.x + col)) * 4;
        out[row * size + col] = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
      }
    }
    return out;
  }
  function toGrayscale(imageData) {
    const { width, height, data } = imageData;
    const out = new Float32Array(width * height);
    for (let i = 0; i < out.length; i++) {
      const j = i * 4;
      out[i] = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
    }
    return out;
  }
  function sobelMagnitude(gray, width, height) {
    const grad = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
        const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
        grad[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return grad;
  }
  function stdDevRegion(data, width, x, y, size) {
    let sum = 0;
    let sq = 0;
    let n = 0;
    for (let row = 0; row < size; row++) {
      const base = (y + row) * width + x;
      for (let col = 0; col < size; col++) {
        const v = data[base + col];
        sum += v;
        sq += v * v;
        n++;
      }
    }
    if (n === 0) return 0;
    const mean = sum / n;
    const variance = Math.max(0, sq / n - mean * mean);
    return Math.sqrt(variance);
  }
  function buildTemplateGradient(alphaMap, size) {
    return sobelMagnitude(alphaMap, size, size);
  }
  function scoreCandidate({ gray, grad, width, height }, alphaMap, templateGrad, candidate) {
    const { x, y, size } = candidate;
    if (x < 0 || y < 0 || x + size > width || y + size > height) {
      return null;
    }
    const grayRegion = getRegion(gray, width, x, y, size);
    const gradRegion = getRegion(grad, width, x, y, size);
    const spatial = normalizedCrossCorrelation(grayRegion, alphaMap);
    const gradient = normalizedCrossCorrelation(gradRegion, templateGrad);
    let varianceScore = 0;
    if (y > 8) {
      const refY = Math.max(0, y - size);
      const refH = Math.min(size, y - refY);
      if (refH > 8) {
        const wmStd = stdDevRegion(gray, width, x, y, size);
        const refStd = stdDevRegion(gray, width, x, refY, refH);
        if (refStd > EPSILON) {
          varianceScore = clamp2(1 - wmStd / refStd, 0, 1);
        }
      }
    }
    const confidence = Math.max(0, spatial) * 0.5 + Math.max(0, gradient) * 0.3 + varianceScore * 0.2;
    return {
      confidence: clamp2(confidence, 0, 1),
      spatialScore: spatial,
      gradientScore: gradient,
      varianceScore
    };
  }
  function createScaleList(minSize, maxSize) {
    const set = /* @__PURE__ */ new Set();
    for (let s = minSize; s <= maxSize; s += 8) set.add(s);
    if (48 >= minSize && 48 <= maxSize) set.add(48);
    if (96 >= minSize && 96 <= maxSize) set.add(96);
    return [...set].sort((a, b) => a - b);
  }
  function buildSeedConfigs(width, height, defaultConfig) {
    return resolveGeminiWatermarkSearchConfigs(width, height, defaultConfig);
  }
  function getTemplate(cache, alpha96, size) {
    if (cache.has(size)) return cache.get(size);
    const alpha = size === 96 ? alpha96 : interpolateAlphaMap(alpha96, 96, size);
    const grad = buildTemplateGradient(alpha, size);
    const tpl = { alpha, grad };
    cache.set(size, tpl);
    return tpl;
  }
  function warpAlphaMap(alphaMap, size, { dx = 0, dy = 0, scale = 1 } = {}) {
    if (size <= 0) return new Float32Array(0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(scale) || scale <= 0) {
      return new Float32Array(0);
    }
    if (dx === 0 && dy === 0 && scale === 1) return new Float32Array(alphaMap);
    const sample = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const ix0 = clamp2(x0, 0, size - 1);
      const iy0 = clamp2(y0, 0, size - 1);
      const ix1 = clamp2(x0 + 1, 0, size - 1);
      const iy1 = clamp2(y0 + 1, 0, size - 1);
      const p00 = alphaMap[iy0 * size + ix0];
      const p10 = alphaMap[iy0 * size + ix1];
      const p01 = alphaMap[iy1 * size + ix0];
      const p11 = alphaMap[iy1 * size + ix1];
      const top = p00 + (p10 - p00) * fx;
      const bottom = p01 + (p11 - p01) * fx;
      return top + (bottom - top) * fy;
    };
    const out = new Float32Array(size * size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sx = (x - c) / scale + c + dx;
        const sy = (y - c) / scale + c + dy;
        out[y * size + x] = sample(sx, sy);
      }
    }
    return out;
  }
  function interpolateAlphaMap(sourceAlpha, sourceSize, targetSize) {
    if (targetSize <= 0) return new Float32Array(0);
    if (sourceSize === targetSize) return new Float32Array(sourceAlpha);
    const out = new Float32Array(targetSize * targetSize);
    const scale = (sourceSize - 1) / Math.max(1, targetSize - 1);
    for (let y = 0; y < targetSize; y++) {
      const sy = y * scale;
      const y0 = Math.floor(sy);
      const y1 = Math.min(sourceSize - 1, y0 + 1);
      const fy = sy - y0;
      for (let x = 0; x < targetSize; x++) {
        const sx = x * scale;
        const x0 = Math.floor(sx);
        const x1 = Math.min(sourceSize - 1, x0 + 1);
        const fx = sx - x0;
        const p00 = sourceAlpha[y0 * sourceSize + x0];
        const p10 = sourceAlpha[y0 * sourceSize + x1];
        const p01 = sourceAlpha[y1 * sourceSize + x0];
        const p11 = sourceAlpha[y1 * sourceSize + x1];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[y * targetSize + x] = top + (bottom - top) * fy;
      }
    }
    return out;
  }
  function computeRegionSpatialCorrelation({ imageData, alphaMap, region }) {
    const patch = toRegionGrayscale(imageData, region);
    if (patch.length === 0 || patch.length !== alphaMap.length) return 0;
    return normalizedCrossCorrelation(patch, alphaMap);
  }
  function computeRegionGradientCorrelation({ imageData, alphaMap, region }) {
    const patch = toRegionGrayscale(imageData, region);
    if (patch.length === 0 || patch.length !== alphaMap.length) return 0;
    const size = region.size ?? Math.min(region.width, region.height);
    if (!size || size <= 2) return 0;
    const patchGrad = sobelMagnitude(patch, size, size);
    const alphaGrad = sobelMagnitude(alphaMap, size, size);
    return normalizedCrossCorrelation(patchGrad, alphaGrad);
  }
  function shouldAttemptAdaptiveFallback({
    processedImageData,
    alphaMap,
    position,
    residualThreshold = 0.22,
    originalImageData = null,
    originalSpatialMismatchThreshold = 0
  }) {
    const residualScore = computeRegionSpatialCorrelation({
      imageData: processedImageData,
      alphaMap,
      region: {
        x: position.x,
        y: position.y,
        size: position.width ?? position.size
      }
    });
    if (residualScore >= residualThreshold) {
      return true;
    }
    if (originalImageData) {
      const originalScore = computeRegionSpatialCorrelation({
        imageData: originalImageData,
        alphaMap,
        region: {
          x: position.x,
          y: position.y,
          size: position.width ?? position.size
        }
      });
      if (originalScore <= originalSpatialMismatchThreshold) {
        return true;
      }
    }
    return false;
  }
  function detectAdaptiveWatermarkRegion({
    imageData,
    alpha96,
    defaultConfig,
    threshold = DEFAULT_THRESHOLD
  }) {
    const { width, height } = imageData;
    const gray = toGrayscale(imageData);
    const grad = sobelMagnitude(gray, width, height);
    const context = { gray, grad, width, height };
    const templateCache = /* @__PURE__ */ new Map();
    const seedConfigs = buildSeedConfigs(width, height, defaultConfig);
    const seedCandidates = seedConfigs.map((config) => {
      const size = config.logoSize;
      const candidate = {
        size,
        x: width - config.marginRight - size,
        y: height - config.marginBottom - size
      };
      if (candidate.x < 0 || candidate.y < 0 || candidate.x + size > width || candidate.y + size > height) {
        return null;
      }
      const template = getTemplate(templateCache, alpha96, size);
      const score = scoreCandidate(context, template.alpha, template.grad, candidate);
      if (!score) return null;
      return {
        ...candidate,
        ...score
      };
    }).filter(Boolean);
    const bestSeed = seedCandidates.reduce((best2, candidate) => {
      if (!best2 || candidate.confidence > best2.confidence) return candidate;
      return best2;
    }, null);
    if (bestSeed && bestSeed.confidence >= threshold + 0.08) {
      return {
        found: true,
        confidence: bestSeed.confidence,
        spatialScore: bestSeed.spatialScore,
        gradientScore: bestSeed.gradientScore,
        varianceScore: bestSeed.varianceScore,
        region: {
          x: bestSeed.x,
          y: bestSeed.y,
          size: bestSeed.size
        }
      };
    }
    const baseSize = defaultConfig.logoSize;
    const minSize = clamp2(Math.round(baseSize * 0.65), 24, 144);
    const maxSize = clamp2(
      Math.min(Math.round(baseSize * 2.8), Math.floor(Math.min(width, height) * 0.4)),
      minSize,
      192
    );
    const scaleList = createScaleList(minSize, maxSize);
    const marginRange = Math.max(32, Math.round(baseSize * 0.75));
    const minMarginRight = clamp2(defaultConfig.marginRight - marginRange, 8, width - minSize - 1);
    const maxMarginRight = clamp2(defaultConfig.marginRight + marginRange, minMarginRight, width - minSize - 1);
    const minMarginBottom = clamp2(defaultConfig.marginBottom - marginRange, 8, height - minSize - 1);
    const maxMarginBottom = clamp2(defaultConfig.marginBottom + marginRange, minMarginBottom, height - minSize - 1);
    const topK = [];
    const pushTopK = (candidate) => {
      topK.push(candidate);
      topK.sort((a, b) => b.adjustedScore - a.adjustedScore);
      if (topK.length > 5) topK.length = 5;
    };
    for (const seedCandidate of seedCandidates) {
      pushTopK({
        size: seedCandidate.size,
        x: seedCandidate.x,
        y: seedCandidate.y,
        adjustedScore: seedCandidate.confidence * Math.min(1, Math.sqrt(seedCandidate.size / 96))
      });
    }
    for (const size of scaleList) {
      const tpl = getTemplate(templateCache, alpha96, size);
      for (let mr = minMarginRight; mr <= maxMarginRight; mr += 8) {
        const x = width - mr - size;
        if (x < 0) continue;
        for (let mb = minMarginBottom; mb <= maxMarginBottom; mb += 8) {
          const y = height - mb - size;
          if (y < 0) continue;
          const score = scoreCandidate(context, tpl.alpha, tpl.grad, { x, y, size });
          if (!score) continue;
          const adjustedScore = score.confidence * Math.min(1, Math.sqrt(size / 96));
          if (adjustedScore < 0.08) continue;
          pushTopK({
            size,
            x,
            y,
            adjustedScore
          });
        }
      }
    }
    let best = bestSeed ?? {
      x: width - defaultConfig.marginRight - defaultConfig.logoSize,
      y: height - defaultConfig.marginBottom - defaultConfig.logoSize,
      size: defaultConfig.logoSize,
      confidence: 0,
      spatialScore: 0,
      gradientScore: 0,
      varianceScore: 0
    };
    for (const coarse of topK) {
      const scaleLo = clamp2(coarse.size - 10, minSize, maxSize);
      const scaleHi = clamp2(coarse.size + 10, minSize, maxSize);
      for (let size = scaleLo; size <= scaleHi; size += 2) {
        const tpl = getTemplate(templateCache, alpha96, size);
        for (let x = coarse.x - 8; x <= coarse.x + 8; x += 2) {
          if (x < 0 || x + size > width) continue;
          for (let y = coarse.y - 8; y <= coarse.y + 8; y += 2) {
            if (y < 0 || y + size > height) continue;
            const score = scoreCandidate(context, tpl.alpha, tpl.grad, { x, y, size });
            if (!score) continue;
            if (score.confidence > best.confidence) {
              best = {
                x,
                y,
                size,
                ...score
              };
            }
          }
        }
      }
    }
    return {
      found: best.confidence >= threshold,
      confidence: best.confidence,
      spatialScore: best.spatialScore,
      gradientScore: best.gradientScore,
      varianceScore: best.varianceScore,
      region: {
        x: best.x,
        y: best.y,
        size: best.size
      }
    };
  }

  // src/core/restorationMetrics.js
  var NEAR_BLACK_THRESHOLD = 5;
  var TEXTURE_REFERENCE_MARGIN = 1;
  var TEXTURE_STD_FLOOR_RATIO = 0.8;
  var TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD = 1.5;
  var TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.5;
  var TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.2;
  var DEFAULT_HALO_MIN_ALPHA = 0.12;
  var DEFAULT_HALO_MAX_ALPHA = 0.35;
  var DEFAULT_HALO_OUTSIDE_ALPHA_MAX = 0.01;
  var DEFAULT_HALO_OUTER_MARGIN = 3;
  function cloneImageData(imageData) {
    if (typeof ImageData !== "undefined" && imageData instanceof ImageData) {
      return new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
    }
    return {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data)
    };
  }
  function calculateNearBlackRatio(imageData, position) {
    let nearBlack = 0;
    let total = 0;
    for (let row = 0; row < position.height; row++) {
      for (let col = 0; col < position.width; col++) {
        const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        if (r <= NEAR_BLACK_THRESHOLD && g <= NEAR_BLACK_THRESHOLD && b <= NEAR_BLACK_THRESHOLD) {
          nearBlack++;
        }
        total++;
      }
    }
    return total > 0 ? nearBlack / total : 0;
  }
  function calculateRegionTextureStats(imageData, region) {
    let sum = 0;
    let sq = 0;
    let total = 0;
    for (let row = 0; row < region.height; row++) {
      for (let col = 0; col < region.width; col++) {
        const idx = ((region.y + row) * imageData.width + (region.x + col)) * 4;
        const lum = 0.2126 * imageData.data[idx] + 0.7152 * imageData.data[idx + 1] + 0.0722 * imageData.data[idx + 2];
        sum += lum;
        sq += lum * lum;
        total++;
      }
    }
    const meanLum = total > 0 ? sum / total : 0;
    const variance = total > 0 ? Math.max(0, sq / total - meanLum * meanLum) : 0;
    return {
      meanLum,
      stdLum: Math.sqrt(variance)
    };
  }
  function getRegionTextureStats(imageData, region) {
    return calculateRegionTextureStats(imageData, region);
  }
  function assessAlphaBandHalo({
    imageData,
    position,
    alphaMap,
    minAlpha = DEFAULT_HALO_MIN_ALPHA,
    maxAlpha = DEFAULT_HALO_MAX_ALPHA,
    outsideAlphaMax = DEFAULT_HALO_OUTSIDE_ALPHA_MAX,
    outerMargin = DEFAULT_HALO_OUTER_MARGIN
  }) {
    let bandSum = 0;
    let bandSq = 0;
    let bandCount = 0;
    let outerSum = 0;
    let outerSq = 0;
    let outerCount = 0;
    for (let row = -outerMargin; row < position.height + outerMargin; row++) {
      for (let col = -outerMargin; col < position.width + outerMargin; col++) {
        const pixelX = position.x + col;
        const pixelY = position.y + row;
        if (pixelX < 0 || pixelY < 0 || pixelX >= imageData.width || pixelY >= imageData.height) {
          continue;
        }
        const pixelIndex = (pixelY * imageData.width + pixelX) * 4;
        const luminance = 0.2126 * imageData.data[pixelIndex] + 0.7152 * imageData.data[pixelIndex + 1] + 0.0722 * imageData.data[pixelIndex + 2];
        const insideRegion = row >= 0 && col >= 0 && row < position.height && col < position.width;
        const alpha = insideRegion ? alphaMap[row * position.width + col] : 0;
        if (insideRegion && alpha >= minAlpha && alpha <= maxAlpha) {
          bandSum += luminance;
          bandSq += luminance * luminance;
          bandCount++;
          continue;
        }
        if (!insideRegion || alpha <= outsideAlphaMax) {
          outerSum += luminance;
          outerSq += luminance * luminance;
          outerCount++;
        }
      }
    }
    const bandMeanLum = bandCount > 0 ? bandSum / bandCount : 0;
    const outerMeanLum = outerCount > 0 ? outerSum / outerCount : 0;
    const bandStdLum = bandCount > 0 ? Math.sqrt(Math.max(0, bandSq / bandCount - bandMeanLum * bandMeanLum)) : 0;
    const outerStdLum = outerCount > 0 ? Math.sqrt(Math.max(0, outerSq / outerCount - outerMeanLum * outerMeanLum)) : 0;
    const deltaLum = bandMeanLum - outerMeanLum;
    const visibility = deltaLum / Math.max(1, outerStdLum);
    return {
      bandCount,
      outerCount,
      bandMeanLum,
      outerMeanLum,
      bandStdLum,
      outerStdLum,
      deltaLum,
      positiveDeltaLum: Math.max(0, deltaLum),
      visibility
    };
  }
  function getReferenceRegion(position, imageData) {
    const referenceY = position.y - position.height;
    if (referenceY < 0) return null;
    return {
      x: position.x,
      y: referenceY,
      width: position.width,
      height: position.height
    };
  }
  function assessReferenceTextureAlignment({
    originalImageData,
    referenceImageData,
    candidateImageData,
    position
  }) {
    const candidateTextureStats = candidateImageData ? calculateRegionTextureStats(candidateImageData, position) : null;
    return assessReferenceTextureAlignmentFromStats({
      originalImageData,
      referenceImageData,
      candidateTextureStats,
      position
    });
  }
  function assessReferenceTextureAlignmentFromStats({
    originalImageData,
    referenceImageData,
    candidateTextureStats,
    position
  }) {
    const resolvedReferenceImageData = referenceImageData ?? originalImageData;
    const referenceRegion = resolvedReferenceImageData ? getReferenceRegion(position, resolvedReferenceImageData) : null;
    const referenceTextureStats = referenceRegion ? calculateRegionTextureStats(resolvedReferenceImageData, referenceRegion) : null;
    const darknessPenalty = referenceTextureStats && candidateTextureStats ? Math.max(0, referenceTextureStats.meanLum - candidateTextureStats.meanLum - TEXTURE_REFERENCE_MARGIN) / Math.max(1, referenceTextureStats.meanLum) : 0;
    const flatnessPenalty = referenceTextureStats && candidateTextureStats ? Math.max(0, referenceTextureStats.stdLum * TEXTURE_STD_FLOOR_RATIO - candidateTextureStats.stdLum) / Math.max(1, referenceTextureStats.stdLum) : 0;
    const darknessVisibility = referenceTextureStats && candidateTextureStats ? Math.max(0, referenceTextureStats.meanLum - candidateTextureStats.meanLum - TEXTURE_REFERENCE_MARGIN) / Math.max(1, referenceTextureStats.stdLum) : 0;
    const tooDark = darknessPenalty > 0;
    const tooFlat = flatnessPenalty > 0;
    const visibleDarkHole = tooDark && darknessVisibility >= TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD;
    const strongDarkFlatCollapse = tooDark && tooFlat && darknessPenalty >= TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD && flatnessPenalty >= TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD;
    return {
      referenceTextureStats,
      candidateTextureStats,
      darknessPenalty,
      flatnessPenalty,
      darknessVisibility,
      texturePenalty: darknessPenalty * 2 + flatnessPenalty * 2,
      tooDark,
      tooFlat,
      visibleDarkHole,
      hardReject: strongDarkFlatCollapse || visibleDarkHole
    };
  }
  function scoreRegion(imageData, alphaMap, position) {
    return {
      spatialScore: computeRegionSpatialCorrelation({
        imageData,
        alphaMap,
        region: {
          x: position.x,
          y: position.y,
          size: position.width
        }
      }),
      gradientScore: computeRegionGradientCorrelation({
        imageData,
        alphaMap,
        region: {
          x: position.x,
          y: position.y,
          size: position.width
        }
      })
    };
  }

  // src/core/multiPassRemoval.js
  var DEFAULT_MAX_PASSES = 4;
  var DEFAULT_RESIDUAL_THRESHOLD = 0.25;
  var MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;
  function removeRepeatedWatermarkLayers(imageDataOrOptions, alphaMapArg, positionArg, optionsArg = {}) {
    const isObjectCall = imageDataOrOptions && typeof imageDataOrOptions === "object" && "imageData" in imageDataOrOptions && alphaMapArg === void 0;
    const imageData = isObjectCall ? imageDataOrOptions.imageData : imageDataOrOptions;
    const alphaMap = isObjectCall ? imageDataOrOptions.alphaMap : alphaMapArg;
    const position = isObjectCall ? imageDataOrOptions.position : positionArg;
    const options = isObjectCall ? imageDataOrOptions : optionsArg;
    const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
    const residualThreshold = options.residualThreshold ?? DEFAULT_RESIDUAL_THRESHOLD;
    const startingPassIndex = Math.max(0, options.startingPassIndex ?? 0);
    const alphaGain = Number.isFinite(options.alphaGain) && options.alphaGain > 0 ? options.alphaGain : 1;
    let currentImageData = cloneImageData(imageData);
    const referenceImageData = currentImageData;
    const baseNearBlackRatio = calculateNearBlackRatio(currentImageData, position);
    const maxNearBlackRatio = Math.min(1, baseNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);
    const passes = [];
    let stopReason = "max-passes";
    let appliedPassCount = startingPassIndex;
    let attemptedPassCount = startingPassIndex;
    for (let passIndex = 0; passIndex < maxPasses; passIndex++) {
      attemptedPassCount = startingPassIndex + passIndex + 1;
      const before = scoreRegion(currentImageData, alphaMap, position);
      const candidate = cloneImageData(currentImageData);
      removeWatermark(candidate, alphaMap, position, { alphaGain });
      const after = scoreRegion(candidate, alphaMap, position);
      const nearBlackRatio = calculateNearBlackRatio(candidate, position);
      const improvement = Math.abs(before.spatialScore) - Math.abs(after.spatialScore);
      const gradientDelta = after.gradientScore - before.gradientScore;
      const textureAssessment = assessReferenceTextureAlignment({
        referenceImageData,
        candidateImageData: candidate,
        position
      });
      if (nearBlackRatio > maxNearBlackRatio) {
        stopReason = "safety-near-black";
        break;
      }
      if (textureAssessment.hardReject) {
        stopReason = "safety-texture-collapse";
        break;
      }
      currentImageData = candidate;
      appliedPassCount = startingPassIndex + passIndex + 1;
      passes.push({
        index: appliedPassCount,
        beforeSpatialScore: before.spatialScore,
        beforeGradientScore: before.gradientScore,
        afterSpatialScore: after.spatialScore,
        afterGradientScore: after.gradientScore,
        improvement,
        gradientDelta,
        nearBlackRatio
      });
      if (Math.abs(after.spatialScore) <= residualThreshold) {
        stopReason = "residual-low";
        break;
      }
    }
    return {
      imageData: currentImageData,
      passCount: appliedPassCount,
      attemptedPassCount,
      stopReason,
      passes
    };
  }

  // src/core/watermarkPresence.js
  function hasReliableStandardWatermarkSignal({ spatialScore, gradientScore }) {
    return classifyStandardWatermarkSignal({ spatialScore, gradientScore }).tier === "direct-match";
  }
  function hasReliableAdaptiveWatermarkSignal(adaptiveResult) {
    return classifyAdaptiveWatermarkSignal(adaptiveResult).tier === "direct-match";
  }

  // src/core/candidateSelector.js
  var MAX_NEAR_BLACK_RATIO_INCREASE2 = 0.05;
  var VALIDATION_MIN_IMPROVEMENT = 0.08;
  var VALIDATION_TARGET_RESIDUAL = 0.22;
  var VALIDATION_MAX_GRADIENT_INCREASE = 0.04;
  var VALIDATION_MIN_CONFIDENCE_FOR_ADAPTIVE_TRIAL = 0.25;
  var STANDARD_FAST_PATH_RESIDUAL_THRESHOLD = 0.22;
  var STANDARD_FAST_PATH_GRADIENT_THRESHOLD = 0.08;
  var STANDARD_NEARBY_SEARCH_RESIDUAL_THRESHOLD = 0.18;
  var STANDARD_NEARBY_SEARCH_GRADIENT_THRESHOLD = 0.05;
  var STANDARD_LOCAL_SHIFT_STRONG_BASE_GRADIENT_SCORE = 0.35;
  var STANDARD_LOCAL_SHIFT_STRONG_BASE_SPATIAL_SCORE = 0.8;
  var STANDARD_LOCAL_SHIFT_WEAK_CANDIDATE_GRADIENT_SCORE = 0.12;
  var STANDARD_LOCAL_SHIFT_WEAK_CANDIDATE_SPATIAL_SCORE = 0.65;
  var STANDARD_LOCAL_SHIFT_MIN_VALIDATION_ADVANTAGE = 0.3;
  var STANDARD_LOCAL_SHIFT_SKIP_PROCESSED_GRADIENT_THRESHOLD = 0.02;
  var STANDARD_LOCAL_SHIFT_PRESERVE_CLEAN_BASE_GRADIENT_THRESHOLD = 0.02;
  var STANDARD_LOCAL_SHIFT_MAX_CANDIDATE_GRADIENT_FOR_CLEAN_BASE = 0.03;
  var TEMPLATE_ALIGN_SHIFTS = [-0.5, -0.25, 0, 0.25, 0.5];
  var TEMPLATE_ALIGN_SCALES = [0.99, 1, 1.01];
  var STANDARD_NEARBY_SHIFTS = [-12, -8, -4, 0, 4, 8, 12];
  var STANDARD_FINE_LOCAL_SHIFTS = [-2, -1, 0, 1, 2];
  var STANDARD_SIZE_JITTERS = [-12, -10, -8, -6, -4, -2, 2, 4, 6, 8, 10, 12];
  var PREVIEW_ANCHOR_MIN_SIZE = 24;
  var PREVIEW_ANCHOR_MAX_SIZE_RATIO = 1.05;
  var PREVIEW_ANCHOR_MIN_SIZE_RATIO = 0.55;
  var PREVIEW_ANCHOR_MARGIN_WINDOW = 16;
  var PREVIEW_ANCHOR_MARGIN_EXTENSION = 8;
  var PREVIEW_ANCHOR_SIZE_STEP = 2;
  var PREVIEW_ANCHOR_MARGIN_STEP = 2;
  var PREVIEW_ANCHOR_TOP_K = 8;
  var PREVIEW_ANCHOR_MIN_SCORE = 0.2;
  var PREVIEW_ANCHOR_LOCAL_DELTAS = [-1, 0, 1];
  var PREVIEW_TEMPLATE_ALIGN_SHIFTS = [-1, -0.5, 0, 0.5, 1];
  var PREVIEW_TEMPLATE_ALIGN_SCALES = [0.985, 1, 1.015];
  var PREVIEW_ANCHOR_GAIN_SKIP_RESIDUAL_THRESHOLD = 0.22;
  var PREVIEW_ANCHOR_GAIN_SKIP_GRADIENT_THRESHOLD = 0.24;
  var ORIGIN_REGION = Object.freeze({ x: 0, y: 0 });
  function mergeCandidateProvenance(...provenanceParts) {
    const merged = {};
    for (const provenance of provenanceParts) {
      if (!provenance || typeof provenance !== "object") continue;
      Object.assign(merged, provenance);
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }
  function buildStandardCandidateSeeds({
    originalImageData,
    config,
    position,
    alpha48,
    alpha96,
    getAlphaMap,
    resolveAlphaMap = null,
    includeCatalogVariants = true
  }) {
    const configs = includeCatalogVariants ? resolveGeminiWatermarkSearchConfigs(
      originalImageData.width,
      originalImageData.height,
      config
    ) : [config];
    const seeds = [];
    for (const candidateConfig of configs) {
      const candidatePosition = candidateConfig === config ? position : {
        x: originalImageData.width - candidateConfig.marginRight - candidateConfig.logoSize,
        y: originalImageData.height - candidateConfig.marginBottom - candidateConfig.logoSize,
        width: candidateConfig.logoSize,
        height: candidateConfig.logoSize
      };
      if (candidatePosition.x < 0 || candidatePosition.y < 0 || candidatePosition.x + candidatePosition.width > originalImageData.width || candidatePosition.y + candidatePosition.height > originalImageData.height) {
        continue;
      }
      const alphaMap = typeof resolveAlphaMap === "function" ? resolveAlphaMap(candidateConfig.logoSize) : resolveAlphaMapForSize(candidateConfig.logoSize, {
        alpha48,
        alpha96,
        getAlphaMap
      });
      if (!alphaMap) continue;
      seeds.push({
        config: candidateConfig,
        position: candidatePosition,
        alphaMap,
        source: candidateConfig === config ? "standard" : "standard+catalog",
        provenance: candidateConfig === config ? null : { catalogVariant: true }
      });
    }
    return seeds;
  }
  function inferDecisionTier(candidate, { directMatch = false } = {}) {
    if (!candidate) return "insufficient";
    if (directMatch) return "direct-match";
    if (candidate.source?.includes("validated")) return "validated-match";
    if (candidate.accepted) return "validated-match";
    return "safe-removal";
  }
  function shouldEscalateSearch(candidate) {
    if (!candidate) return true;
    return Math.abs(candidate.processedSpatialScore) > STANDARD_FAST_PATH_RESIDUAL_THRESHOLD || Math.max(0, candidate.processedGradientScore) > STANDARD_FAST_PATH_GRADIENT_THRESHOLD;
  }
  function shouldSearchNearbyStandardCandidate(candidate, originalImageData) {
    if (!candidate) return true;
    return Number(candidate.position?.width) >= 72 && Number(originalImageData?.height) > Number(originalImageData?.width) * 1.25 && (Math.abs(candidate.processedSpatialScore) > STANDARD_NEARBY_SEARCH_RESIDUAL_THRESHOLD || Math.max(0, candidate.processedGradientScore) > STANDARD_NEARBY_SEARCH_GRADIENT_THRESHOLD);
  }
  function resolveAlphaMapForSize(size, { alpha48, alpha96, getAlphaMap } = {}) {
    if (size === 48) return alpha48;
    if (size === 96) return alpha96;
    const provided = typeof getAlphaMap === "function" ? getAlphaMap(size) : null;
    if (provided) return provided;
    return alpha96 ? interpolateAlphaMap(alpha96, 96, size) : null;
  }
  function createAlphaMapResolver({ alpha48, alpha96, getAlphaMap }) {
    const cache = /* @__PURE__ */ new Map();
    return (size) => {
      if (cache.has(size)) {
        return cache.get(size);
      }
      const resolved = resolveAlphaMapForSize(size, {
        alpha48,
        alpha96,
        getAlphaMap
      });
      cache.set(size, resolved);
      return resolved;
    };
  }
  function isPreviewAnchorGainSearchRequired(candidate) {
    if (!candidate) return true;
    return Math.abs(candidate.processedSpatialScore) > PREVIEW_ANCHOR_GAIN_SKIP_RESIDUAL_THRESHOLD || Math.max(0, candidate.processedGradientScore) > PREVIEW_ANCHOR_GAIN_SKIP_GRADIENT_THRESHOLD;
  }
  function evaluateRestorationCandidate({
    originalImageData,
    alphaMap,
    position,
    source,
    config,
    baselineNearBlackRatio,
    adaptiveConfidence = null,
    alphaGain = 1,
    provenance = null,
    includeImageData = true
  }) {
    if (!alphaMap || !position) return null;
    const originalScores = scoreRegion(originalImageData, alphaMap, position);
    const regionImageData = createCandidateRegionImageData({
      originalImageData,
      alphaMap,
      position,
      alphaGain
    });
    const regionPosition = {
      x: ORIGIN_REGION.x,
      y: ORIGIN_REGION.y,
      width: position.width,
      height: position.height
    };
    const processedScores = scoreRegion(regionImageData, alphaMap, regionPosition);
    const nearBlackRatio = calculateNearBlackRatio(regionImageData, regionPosition);
    const nearBlackIncrease = nearBlackRatio - baselineNearBlackRatio;
    const improvement = originalScores.spatialScore - processedScores.spatialScore;
    const gradientIncrease = processedScores.gradientScore - originalScores.gradientScore;
    const textureAssessment = assessReferenceTextureAlignmentFromStats({
      originalImageData,
      referenceImageData: originalImageData,
      candidateTextureStats: getRegionTextureStats(regionImageData, regionPosition),
      position
    });
    const texturePenalty = textureAssessment.texturePenalty;
    const accepted = textureAssessment.hardReject !== true && nearBlackIncrease <= MAX_NEAR_BLACK_RATIO_INCREASE2 && improvement >= VALIDATION_MIN_IMPROVEMENT && (Math.abs(processedScores.spatialScore) <= VALIDATION_TARGET_RESIDUAL || gradientIncrease <= VALIDATION_MAX_GRADIENT_INCREASE);
    return {
      accepted,
      source,
      config,
      position,
      alphaMap,
      adaptiveConfidence,
      alphaGain,
      provenance: mergeCandidateProvenance(provenance),
      imageData: includeImageData ? materializeCandidateImageData(originalImageData, alphaMap, position, alphaGain) : null,
      originalSpatialScore: originalScores.spatialScore,
      originalGradientScore: originalScores.gradientScore,
      processedSpatialScore: processedScores.spatialScore,
      processedGradientScore: processedScores.gradientScore,
      improvement,
      nearBlackRatio,
      nearBlackIncrease,
      gradientIncrease,
      tooDark: textureAssessment.tooDark,
      tooFlat: textureAssessment.tooFlat,
      hardReject: textureAssessment.hardReject,
      texturePenalty,
      validationCost: Math.abs(processedScores.spatialScore) + Math.max(0, processedScores.gradientScore) * 0.6 + Math.max(0, nearBlackIncrease) * 3 + texturePenalty
    };
  }
  function pickBestValidatedCandidate(candidates) {
    const accepted = candidates.filter((candidate) => candidate?.accepted);
    if (accepted.length === 0) return null;
    accepted.sort((a, b) => {
      if (a.validationCost !== b.validationCost) {
        return a.validationCost - b.validationCost;
      }
      return b.improvement - a.improvement;
    });
    return accepted[0];
  }
  function createCandidateRegionImageData({
    originalImageData,
    alphaMap,
    position,
    alphaGain
  }) {
    const regionImageData = {
      width: position.width,
      height: position.height,
      data: new Uint8ClampedArray(position.width * position.height * 4)
    };
    for (let row = 0; row < position.height; row++) {
      const srcStart = ((position.y + row) * originalImageData.width + position.x) * 4;
      const srcEnd = srcStart + position.width * 4;
      const destStart = row * position.width * 4;
      regionImageData.data.set(originalImageData.data.subarray(srcStart, srcEnd), destStart);
    }
    removeWatermark(regionImageData, alphaMap, {
      x: 0,
      y: 0,
      width: position.width,
      height: position.height
    }, { alphaGain });
    return regionImageData;
  }
  function materializeCandidateImageData(originalImageData, alphaMap, position, alphaGain) {
    const candidateImageData = cloneImageData(originalImageData);
    removeWatermark(candidateImageData, alphaMap, position, { alphaGain });
    return candidateImageData;
  }
  function ensureCandidateImageData(candidate, originalImageData) {
    if (!candidate) return candidate;
    if (candidate.imageData) return candidate;
    return {
      ...candidate,
      imageData: materializeCandidateImageData(
        originalImageData,
        candidate.alphaMap,
        candidate.position,
        candidate.alphaGain ?? 1
      )
    };
  }
  function pickBetterCandidate(currentBest, candidate, minCostDelta = 5e-3) {
    if (!candidate?.accepted) return currentBest;
    if (!currentBest) return candidate;
    if (shouldPreserveStrongStandardAnchor(currentBest, candidate)) {
      return currentBest;
    }
    if (shouldPreferPreviewAnchorCandidate(currentBest, candidate)) {
      return candidate;
    }
    if (shouldPreferPreviewAnchorCandidate(candidate, currentBest)) {
      return currentBest;
    }
    if (candidate.validationCost < currentBest.validationCost - minCostDelta) {
      return candidate;
    }
    if (Math.abs(candidate.validationCost - currentBest.validationCost) <= minCostDelta && candidate.improvement > currentBest.improvement + 0.01) {
      return candidate;
    }
    return currentBest;
  }
  function isStandardCandidateSource(candidate) {
    return typeof candidate?.source === "string" && candidate.source.startsWith("standard");
  }
  function isDriftedStandardCandidate(candidate) {
    return isStandardCandidateSource(candidate) && (candidate?.provenance?.localShift === true || candidate?.provenance?.sizeJitter === true || String(candidate?.source || "").includes("+warp"));
  }
  function isCanonicalStandardCandidate(candidate) {
    return isStandardCandidateSource(candidate) && candidate?.provenance?.localShift !== true && candidate?.provenance?.sizeJitter !== true;
  }
  function hasStrongCanonicalAnchorSignal(candidate) {
    const baseSpatial = Number(candidate?.originalSpatialScore);
    const baseGradient = Number(candidate?.originalGradientScore);
    if (!Number.isFinite(baseSpatial) || !Number.isFinite(baseGradient)) {
      return false;
    }
    return baseGradient >= STANDARD_LOCAL_SHIFT_STRONG_BASE_GRADIENT_SCORE || baseSpatial >= STANDARD_LOCAL_SHIFT_STRONG_BASE_SPATIAL_SCORE;
  }
  function hasWeakDriftEvidence(candidate) {
    const candidateSpatial = Number(candidate?.originalSpatialScore);
    const candidateGradient = Number(candidate?.originalGradientScore);
    if (!Number.isFinite(candidateSpatial) || !Number.isFinite(candidateGradient)) {
      return false;
    }
    return candidateGradient < STANDARD_LOCAL_SHIFT_WEAK_CANDIDATE_GRADIENT_SCORE || candidateSpatial < STANDARD_LOCAL_SHIFT_WEAK_CANDIDATE_SPATIAL_SCORE;
  }
  function leavesWorseResidualGradientThanCanonical(canonicalCandidate, driftCandidate) {
    const canonicalProcessedGradientRaw = Number(canonicalCandidate?.processedGradientScore);
    const driftProcessedGradientRaw = Number(driftCandidate?.processedGradientScore);
    if (!Number.isFinite(canonicalProcessedGradientRaw) || !Number.isFinite(driftProcessedGradientRaw)) {
      return false;
    }
    return Math.max(0, canonicalProcessedGradientRaw) <= STANDARD_LOCAL_SHIFT_PRESERVE_CLEAN_BASE_GRADIENT_THRESHOLD && Math.max(0, driftProcessedGradientRaw) >= STANDARD_LOCAL_SHIFT_MAX_CANDIDATE_GRADIENT_FOR_CLEAN_BASE;
  }
  function shouldPreserveCanonicalAnchor(canonicalCandidate, driftCandidate) {
    if (!isCanonicalStandardCandidate(canonicalCandidate)) return false;
    if (!isDriftedStandardCandidate(driftCandidate)) return false;
    const validationAdvantage = Number(canonicalCandidate.validationCost) - Number(driftCandidate.validationCost);
    if (!Number.isFinite(validationAdvantage)) {
      return false;
    }
    return hasStrongCanonicalAnchorSignal(canonicalCandidate) && hasWeakDriftEvidence(driftCandidate) && validationAdvantage < STANDARD_LOCAL_SHIFT_MIN_VALIDATION_ADVANTAGE || leavesWorseResidualGradientThanCanonical(canonicalCandidate, driftCandidate);
  }
  function shouldPreserveStrongStandardAnchor(currentBest, candidate) {
    if (currentBest?.provenance?.localShift === true) return false;
    if (!isStandardCandidateSource(candidate)) return false;
    return shouldPreserveCanonicalAnchor(currentBest, candidate);
  }
  function shouldRevertLocalShiftToStandardTrial(selectedCandidate, standardTrial) {
    if (selectedCandidate?.provenance?.localShift !== true) return false;
    if (!isStandardCandidateSource(selectedCandidate) || !isStandardCandidateSource(standardTrial)) return false;
    if (!standardTrial?.accepted) return false;
    return shouldPreserveCanonicalAnchor(standardTrial, selectedCandidate);
  }
  function shouldSkipStandardLocalSearch(seedCandidate) {
    if (!seedCandidate) return false;
    return Math.max(0, Number(seedCandidate.processedGradientScore)) <= STANDARD_LOCAL_SHIFT_SKIP_PROCESSED_GRADIENT_THRESHOLD;
  }
  function isPreviewAnchorSearchEligible(originalImageData, config) {
    if (!config || config.logoSize !== 48) return false;
    const width = Number(originalImageData?.width);
    const height = Number(originalImageData?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
    if (width < 384 || width > 1536) return false;
    if (height < 384 || height > 1536) return false;
    if (Math.max(width, height) < 512) return false;
    return matchOfficialGeminiImageSize(width, height) === null;
  }
  function shouldPreferPreviewAnchorCandidate(currentBest, candidate) {
    if (candidate?.provenance?.previewAnchor !== true) return false;
    if (!currentBest || currentBest?.provenance?.previewAnchor === true) return false;
    const currentSpatial = Number(currentBest.originalSpatialScore);
    const currentGradient = Number(currentBest.originalGradientScore);
    const candidateSpatial = Number(candidate.originalSpatialScore);
    const candidateGradient = Number(candidate.originalGradientScore);
    if (!Number.isFinite(currentSpatial) || !Number.isFinite(currentGradient) || !Number.isFinite(candidateSpatial) || !Number.isFinite(candidateGradient)) {
      return false;
    }
    const currentReliable = hasReliableStandardWatermarkSignal({
      spatialScore: currentSpatial,
      gradientScore: currentGradient
    });
    const candidateReliable = hasReliableStandardWatermarkSignal({
      spatialScore: candidateSpatial,
      gradientScore: candidateGradient
    });
    if (candidateReliable && !currentReliable) {
      return true;
    }
    return candidateGradient >= currentGradient + 0.2 && candidateSpatial >= currentSpatial + 0.05;
  }
  function findBestTemplateWarp({
    originalImageData,
    alphaMap,
    position,
    baselineSpatialScore,
    baselineGradientScore,
    shiftCandidates = TEMPLATE_ALIGN_SHIFTS,
    scaleCandidates = TEMPLATE_ALIGN_SCALES
  }) {
    const size = position.width;
    if (!size || size <= 8) return null;
    let best = {
      spatialScore: baselineSpatialScore,
      gradientScore: baselineGradientScore,
      shift: { dx: 0, dy: 0, scale: 1 },
      alphaMap
    };
    for (const scale of scaleCandidates) {
      for (const dy of shiftCandidates) {
        for (const dx of shiftCandidates) {
          if (dx === 0 && dy === 0 && scale === 1) continue;
          const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
          const spatialScore = computeRegionSpatialCorrelation({
            imageData: originalImageData,
            alphaMap: warped,
            region: { x: position.x, y: position.y, size }
          });
          const gradientScore = computeRegionGradientCorrelation({
            imageData: originalImageData,
            alphaMap: warped,
            region: { x: position.x, y: position.y, size }
          });
          const confidence = Math.max(0, spatialScore) * 0.7 + Math.max(0, gradientScore) * 0.3;
          const bestConfidence = Math.max(0, best.spatialScore) * 0.7 + Math.max(0, best.gradientScore) * 0.3;
          if (confidence > bestConfidence + 0.01) {
            best = {
              spatialScore,
              gradientScore,
              shift: { dx, dy, scale },
              alphaMap: warped
            };
          }
        }
      }
    }
    const improvedSpatial = best.spatialScore >= baselineSpatialScore + 0.01;
    const improvedGradient = best.gradientScore >= baselineGradientScore + 0.01;
    return improvedSpatial || improvedGradient ? best : null;
  }
  function searchNearbyStandardCandidate({
    originalImageData,
    candidateSeeds,
    adaptiveConfidence = null
  }) {
    if (!Array.isArray(candidateSeeds) || candidateSeeds.length === 0) return null;
    let bestCandidate = null;
    for (const seed of candidateSeeds) {
      if (shouldSkipStandardLocalSearch(seed)) continue;
      for (const dy of STANDARD_NEARBY_SHIFTS) {
        for (const dx of STANDARD_NEARBY_SHIFTS) {
          if (dx === 0 && dy === 0) continue;
          const candidatePosition = {
            x: seed.position.x + dx,
            y: seed.position.y + dy,
            width: seed.position.width,
            height: seed.position.height
          };
          if (candidatePosition.x < 0 || candidatePosition.y < 0) continue;
          if (candidatePosition.x + candidatePosition.width > originalImageData.width) continue;
          if (candidatePosition.y + candidatePosition.height > originalImageData.height) continue;
          const candidate = evaluateRestorationCandidate({
            originalImageData,
            alphaMap: seed.alphaMap,
            position: candidatePosition,
            source: `${seed.source}+local`,
            config: seed.config,
            baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, candidatePosition),
            adaptiveConfidence,
            provenance: mergeCandidateProvenance(seed.provenance, { localShift: true }),
            includeImageData: false
          });
          if (!candidate?.accepted) continue;
          bestCandidate = pickBetterCandidate(bestCandidate, candidate, 2e-3);
        }
      }
    }
    return bestCandidate;
  }
  function searchStandardSizeJitterCandidate({
    originalImageData,
    candidateSeeds,
    alpha48,
    alpha96,
    getAlphaMap,
    resolveAlphaMap = null,
    adaptiveConfidence = null
  }) {
    if (!Array.isArray(candidateSeeds) || candidateSeeds.length === 0) return null;
    let bestCandidate = null;
    for (const seed of candidateSeeds) {
      for (const delta of STANDARD_SIZE_JITTERS) {
        const size = seed.position.width + delta;
        if (size <= 24) continue;
        if (size === seed.position.width) continue;
        const candidatePosition = {
          x: originalImageData.width - seed.config.marginRight - size,
          y: originalImageData.height - seed.config.marginBottom - size,
          width: size,
          height: size
        };
        if (candidatePosition.x < 0 || candidatePosition.y < 0) continue;
        if (candidatePosition.x + candidatePosition.width > originalImageData.width) continue;
        if (candidatePosition.y + candidatePosition.height > originalImageData.height) continue;
        const candidateAlphaMap = typeof resolveAlphaMap === "function" ? resolveAlphaMap(size) : resolveAlphaMapForSize(size, {
          alpha48,
          alpha96,
          getAlphaMap
        });
        if (!candidateAlphaMap) continue;
        const candidate = evaluateRestorationCandidate({
          originalImageData,
          alphaMap: candidateAlphaMap,
          position: candidatePosition,
          source: `${seed.source}+size`,
          config: {
            logoSize: size,
            marginRight: seed.config.marginRight,
            marginBottom: seed.config.marginBottom
          },
          baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, candidatePosition),
          adaptiveConfidence,
          provenance: mergeCandidateProvenance(seed.provenance, { sizeJitter: true }),
          includeImageData: false
        });
        if (!candidate?.accepted) continue;
        bestCandidate = pickBetterCandidate(bestCandidate, candidate, 2e-3);
      }
    }
    return bestCandidate;
  }
  function searchFineStandardLocalCandidate({
    originalImageData,
    seedCandidate,
    adaptiveConfidence = null,
    shiftCandidates = STANDARD_FINE_LOCAL_SHIFTS
  }) {
    if (!seedCandidate?.alphaMap || !seedCandidate?.position) return null;
    if (shouldSkipStandardLocalSearch(seedCandidate)) return null;
    let bestCandidate = null;
    for (const dy of shiftCandidates) {
      for (const dx of shiftCandidates) {
        if (dx === 0 && dy === 0) continue;
        const candidatePosition = {
          x: seedCandidate.position.x + dx,
          y: seedCandidate.position.y + dy,
          width: seedCandidate.position.width,
          height: seedCandidate.position.height
        };
        if (candidatePosition.x < 0 || candidatePosition.y < 0) continue;
        if (candidatePosition.x + candidatePosition.width > originalImageData.width) continue;
        if (candidatePosition.y + candidatePosition.height > originalImageData.height) continue;
        const candidate = evaluateRestorationCandidate({
          originalImageData,
          alphaMap: seedCandidate.alphaMap,
          position: candidatePosition,
          source: `${seedCandidate.source}+local`,
          config: seedCandidate.config,
          baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, candidatePosition),
          adaptiveConfidence,
          provenance: mergeCandidateProvenance(seedCandidate.provenance, { localShift: true }),
          includeImageData: false
        });
        if (!candidate?.accepted) continue;
        bestCandidate = pickBetterCandidate(bestCandidate, candidate, 2e-3);
      }
    }
    return bestCandidate;
  }
  function searchCandidateAlphaGain({
    originalImageData,
    seedCandidate,
    adaptiveConfidence = null,
    alphaGainCandidates = []
  }) {
    if (!seedCandidate?.alphaMap || !seedCandidate?.position) return null;
    let bestCandidate = null;
    for (const candidateGain of alphaGainCandidates) {
      if (!Number.isFinite(candidateGain) || candidateGain <= 1) continue;
      const candidate = evaluateRestorationCandidate({
        originalImageData,
        alphaMap: seedCandidate.alphaMap,
        position: seedCandidate.position,
        source: `${seedCandidate.source}+gain`,
        config: seedCandidate.config,
        baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, seedCandidate.position),
        adaptiveConfidence,
        alphaGain: candidateGain,
        provenance: seedCandidate.provenance,
        includeImageData: false
      });
      if (!candidate?.accepted) continue;
      bestCandidate = pickBetterCandidate(bestCandidate, candidate, 2e-3);
    }
    return bestCandidate;
  }
  function insertTopPreviewCandidate(topCandidates, candidate) {
    topCandidates.push(candidate);
    topCandidates.sort((a, b) => b.coarseScore - a.coarseScore);
    if (topCandidates.length > PREVIEW_ANCHOR_TOP_K) {
      topCandidates.length = PREVIEW_ANCHOR_TOP_K;
    }
  }
  function searchBottomRightPreviewCandidate({
    originalImageData,
    config,
    alpha48,
    alpha96,
    getAlphaMap,
    resolveAlphaMap = null,
    adaptiveConfidence = null
  }) {
    if (!isPreviewAnchorSearchEligible(originalImageData, config)) return null;
    const minSize = Math.max(
      PREVIEW_ANCHOR_MIN_SIZE,
      Math.round(config.logoSize * PREVIEW_ANCHOR_MIN_SIZE_RATIO)
    );
    const maxSize = Math.max(
      minSize,
      Math.round(config.logoSize * PREVIEW_ANCHOR_MAX_SIZE_RATIO)
    );
    const minMarginRight = Math.max(8, config.marginRight - PREVIEW_ANCHOR_MARGIN_WINDOW);
    const maxMarginRight = config.marginRight + PREVIEW_ANCHOR_MARGIN_EXTENSION;
    const minMarginBottom = Math.max(8, config.marginBottom - PREVIEW_ANCHOR_MARGIN_WINDOW);
    const maxMarginBottom = config.marginBottom + PREVIEW_ANCHOR_MARGIN_EXTENSION;
    const topCandidates = [];
    for (let size = minSize; size <= maxSize; size += PREVIEW_ANCHOR_SIZE_STEP) {
      const alphaMap = typeof resolveAlphaMap === "function" ? resolveAlphaMap(size) : resolveAlphaMapForSize(size, {
        alpha48,
        alpha96,
        getAlphaMap
      });
      if (!alphaMap) continue;
      for (let marginRight = minMarginRight; marginRight <= maxMarginRight; marginRight += PREVIEW_ANCHOR_MARGIN_STEP) {
        const x = originalImageData.width - marginRight - size;
        if (x < 0 || x + size > originalImageData.width) continue;
        for (let marginBottom = minMarginBottom; marginBottom <= maxMarginBottom; marginBottom += PREVIEW_ANCHOR_MARGIN_STEP) {
          const y = originalImageData.height - marginBottom - size;
          if (y < 0 || y + size > originalImageData.height) continue;
          const coarseSpatialScore = computeRegionSpatialCorrelation({
            imageData: originalImageData,
            alphaMap,
            region: { x, y, size }
          });
          const coarseGradientScore = computeRegionGradientCorrelation({
            imageData: originalImageData,
            alphaMap,
            region: { x, y, size }
          });
          const coarseScore = Math.max(0, coarseGradientScore) * 0.6 + Math.max(0, coarseSpatialScore) * 0.4;
          if (coarseScore < PREVIEW_ANCHOR_MIN_SCORE) continue;
          insertTopPreviewCandidate(topCandidates, {
            coarseScore,
            alphaMap,
            position: { x, y, width: size, height: size },
            config: {
              logoSize: size,
              marginRight,
              marginBottom
            }
          });
        }
      }
    }
    let bestCandidate = null;
    for (const coarseCandidate of topCandidates) {
      for (const sizeDelta of PREVIEW_ANCHOR_LOCAL_DELTAS) {
        const size = coarseCandidate.position.width + sizeDelta;
        if (size < PREVIEW_ANCHOR_MIN_SIZE) continue;
        const alphaMap = typeof resolveAlphaMap === "function" ? resolveAlphaMap(size) : resolveAlphaMapForSize(size, {
          alpha48,
          alpha96,
          getAlphaMap
        });
        if (!alphaMap) continue;
        for (const dx of PREVIEW_ANCHOR_LOCAL_DELTAS) {
          for (const dy of PREVIEW_ANCHOR_LOCAL_DELTAS) {
            const position = {
              x: coarseCandidate.position.x + dx,
              y: coarseCandidate.position.y + dy,
              width: size,
              height: size
            };
            if (position.x < 0 || position.y < 0) continue;
            if (position.x + position.width > originalImageData.width) continue;
            if (position.y + position.height > originalImageData.height) continue;
            const config2 = {
              logoSize: size,
              marginRight: originalImageData.width - position.x - size,
              marginBottom: originalImageData.height - position.y - size
            };
            const candidate = evaluateRestorationCandidate({
              originalImageData,
              alphaMap,
              position,
              source: "standard+preview-anchor",
              config: config2,
              baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, position),
              adaptiveConfidence,
              provenance: {
                previewAnchor: true,
                previewAnchorLocalRefine: sizeDelta !== 0 || dx !== 0 || dy !== 0
              },
              includeImageData: false
            });
            if (!candidate?.accepted) continue;
            bestCandidate = pickBetterCandidate(bestCandidate, candidate, 2e-3);
          }
        }
      }
    }
    return bestCandidate;
  }
  function evaluateStandardTrialsForSeeds({
    originalImageData,
    candidateSeeds
  }) {
    const standardTrials = candidateSeeds.map((seed) => evaluateRestorationCandidate({
      originalImageData,
      alphaMap: seed.alphaMap,
      position: seed.position,
      source: seed.source,
      config: seed.config,
      baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, seed.position),
      provenance: seed.provenance,
      includeImageData: false
    })).filter(Boolean);
    const standardTrial = standardTrials.find((candidate) => candidate.source === "standard") ?? standardTrials[0] ?? null;
    const standardSpatialScore = standardTrial?.originalSpatialScore ?? null;
    const standardGradientScore = standardTrial?.originalGradientScore ?? null;
    const hasReliableStandardMatch = hasReliableStandardWatermarkSignal({
      spatialScore: standardSpatialScore,
      gradientScore: standardGradientScore
    });
    return {
      standardTrials,
      standardTrial,
      standardSpatialScore,
      standardGradientScore,
      hasReliableStandardMatch
    };
  }
  function resolveStandardAnchorSelection({
    originalImageData,
    config,
    position,
    alpha48,
    alpha96,
    getAlphaMap,
    resolveAlphaMap
  }) {
    let standardCandidateSeeds = buildStandardCandidateSeeds({
      originalImageData,
      config,
      position,
      alpha48,
      alpha96,
      getAlphaMap,
      resolveAlphaMap,
      includeCatalogVariants: false
    });
    let standardSelection = evaluateStandardTrialsForSeeds({
      originalImageData,
      candidateSeeds: standardCandidateSeeds
    });
    const shouldExpandStandardCatalog = !standardSelection.hasReliableStandardMatch && (!standardSelection.standardTrial || shouldEscalateSearch(standardSelection.standardTrial));
    if (shouldExpandStandardCatalog) {
      standardCandidateSeeds = buildStandardCandidateSeeds({
        originalImageData,
        config,
        position,
        alpha48,
        alpha96,
        getAlphaMap,
        resolveAlphaMap,
        includeCatalogVariants: true
      });
      standardSelection = evaluateStandardTrialsForSeeds({
        originalImageData,
        candidateSeeds: standardCandidateSeeds
      });
    }
    return {
      standardCandidateSeeds,
      ...standardSelection
    };
  }
  function resolveCandidatePromotion(candidate, {
    reliableMatch = false
  } = {}) {
    if (!candidate?.accepted) {
      return null;
    }
    if (reliableMatch) {
      return {
        candidate,
        decisionTier: "direct-match"
      };
    }
    return {
      candidate: {
        ...candidate,
        source: `${candidate.source}+validated`
      },
      decisionTier: "validated-match"
    };
  }
  function promoteBaseCandidate(baseCandidate, baseDecisionTier, candidate, {
    reliableMatch = false,
    minCostDelta = 2e-3
  } = {}) {
    const promotion = resolveCandidatePromotion(candidate, {
      reliableMatch
    });
    if (!promotion) {
      return {
        baseCandidate,
        baseDecisionTier
      };
    }
    if (shouldPreserveCanonicalAnchor(baseCandidate, promotion.candidate)) {
      return {
        baseCandidate,
        baseDecisionTier
      };
    }
    const previousCandidate = baseCandidate;
    const nextCandidate = pickBetterCandidate(baseCandidate, promotion.candidate, minCostDelta);
    return {
      baseCandidate: nextCandidate,
      baseDecisionTier: nextCandidate !== previousCandidate ? promotion.decisionTier : baseDecisionTier
    };
  }
  function evaluateAdaptiveTrial({
    originalImageData,
    config,
    alpha96,
    resolveAlphaMap,
    allowAdaptiveSearch
  }) {
    if (!allowAdaptiveSearch || !alpha96) {
      return {
        adaptive: null,
        adaptiveConfidence: null,
        adaptiveTrial: null
      };
    }
    const adaptive = detectAdaptiveWatermarkRegion({
      imageData: originalImageData,
      alpha96,
      defaultConfig: config
    });
    const adaptiveConfidence = adaptive?.confidence ?? null;
    if (!adaptive?.region || !(hasReliableAdaptiveWatermarkSignal(adaptive) || adaptive.confidence >= VALIDATION_MIN_CONFIDENCE_FOR_ADAPTIVE_TRIAL)) {
      return {
        adaptive,
        adaptiveConfidence,
        adaptiveTrial: null
      };
    }
    const size = adaptive.region.size;
    const adaptivePosition = {
      x: adaptive.region.x,
      y: adaptive.region.y,
      width: size,
      height: size
    };
    const adaptiveAlphaMap = resolveAlphaMap(size);
    if (!adaptiveAlphaMap) {
      throw new Error(`Missing alpha map for adaptive size ${size}`);
    }
    const adaptiveConfig = {
      logoSize: size,
      marginRight: originalImageData.width - adaptivePosition.x - size,
      marginBottom: originalImageData.height - adaptivePosition.y - size
    };
    return {
      adaptive,
      adaptiveConfidence,
      adaptiveTrial: evaluateRestorationCandidate({
        originalImageData,
        alphaMap: adaptiveAlphaMap,
        position: adaptivePosition,
        source: "adaptive",
        config: adaptiveConfig,
        baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, adaptivePosition),
        adaptiveConfidence: adaptive.confidence,
        provenance: { adaptive: true },
        includeImageData: false
      })
    };
  }
  function refineSelectedAnchorCandidate({
    originalImageData,
    baseCandidate,
    baseDecisionTier,
    adaptiveConfidence,
    alphaGainCandidates
  }) {
    let selectedTrial = ensureCandidateImageData(baseCandidate, originalImageData);
    let alphaMap = baseCandidate.alphaMap;
    let position = baseCandidate.position;
    let config = baseCandidate.config;
    let source = baseCandidate.source;
    let decisionTier = baseDecisionTier || inferDecisionTier(baseCandidate);
    let templateWarp = null;
    let selectedAlphaGain = baseCandidate.alphaGain ?? 1;
    const warpCandidate = findBestTemplateWarp({
      originalImageData,
      alphaMap,
      position,
      baselineSpatialScore: selectedTrial.originalSpatialScore,
      baselineGradientScore: selectedTrial.originalGradientScore,
      shiftCandidates: selectedTrial.provenance?.previewAnchor === true ? PREVIEW_TEMPLATE_ALIGN_SHIFTS : TEMPLATE_ALIGN_SHIFTS,
      scaleCandidates: selectedTrial.provenance?.previewAnchor === true ? PREVIEW_TEMPLATE_ALIGN_SCALES : TEMPLATE_ALIGN_SCALES
    });
    if (warpCandidate) {
      const warpedTrial = evaluateRestorationCandidate({
        originalImageData,
        alphaMap: warpCandidate.alphaMap,
        position,
        source: `${source}+warp`,
        config,
        baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, position),
        adaptiveConfidence,
        provenance: selectedTrial.provenance,
        includeImageData: false
      });
      const betterWarpTrial = pickBetterCandidate(selectedTrial, warpedTrial);
      if (betterWarpTrial !== selectedTrial) {
        alphaMap = warpedTrial.alphaMap;
        source = betterWarpTrial.source;
        selectedTrial = ensureCandidateImageData(betterWarpTrial, originalImageData);
        templateWarp = warpCandidate.shift;
        decisionTier = inferDecisionTier(betterWarpTrial, {
          directMatch: decisionTier === "direct-match"
        });
      }
    }
    const shouldRunGainSearch = selectedTrial.provenance?.previewAnchor === true ? isPreviewAnchorGainSearchRequired(selectedTrial) : shouldEscalateSearch(selectedTrial);
    let bestGainTrial = selectedTrial;
    if (shouldRunGainSearch) {
      for (const candidateGain of alphaGainCandidates) {
        const gainTrial = evaluateRestorationCandidate({
          originalImageData,
          alphaMap,
          position,
          source: `${source}+gain`,
          config,
          baselineNearBlackRatio: calculateNearBlackRatio(originalImageData, position),
          adaptiveConfidence,
          alphaGain: candidateGain,
          provenance: selectedTrial.provenance,
          includeImageData: false
        });
        bestGainTrial = pickBetterCandidate(bestGainTrial, gainTrial);
      }
    }
    if (bestGainTrial !== selectedTrial) {
      selectedTrial = ensureCandidateImageData(bestGainTrial, originalImageData);
      source = bestGainTrial.source;
      selectedAlphaGain = bestGainTrial.alphaGain;
      decisionTier = inferDecisionTier(bestGainTrial, {
        directMatch: decisionTier === "direct-match"
      });
    }
    return {
      selectedTrial: ensureCandidateImageData(selectedTrial, originalImageData),
      source,
      alphaMap,
      position,
      config,
      templateWarp,
      alphaGain: selectedAlphaGain,
      decisionTier
    };
  }
  function selectInitialCandidate({
    originalImageData,
    config,
    position,
    alpha48,
    alpha96,
    getAlphaMap,
    allowAdaptiveSearch,
    alphaGainCandidates
  }) {
    const resolveAlphaMap = createAlphaMapResolver({ alpha48, alpha96, getAlphaMap });
    const fallbackAlphaMap = config.logoSize === 96 ? alpha96 : alpha48;
    const {
      standardCandidateSeeds,
      standardTrials,
      standardTrial,
      standardSpatialScore,
      standardGradientScore,
      hasReliableStandardMatch
    } = resolveStandardAnchorSelection({
      originalImageData,
      config,
      position,
      alpha48,
      alpha96,
      getAlphaMap,
      resolveAlphaMap
    });
    let baseCandidate = null;
    let baseDecisionTier = "insufficient";
    if (hasReliableStandardMatch && standardTrial?.accepted) {
      baseCandidate = standardTrial;
      baseDecisionTier = "direct-match";
    } else if (standardTrial?.accepted) {
      baseCandidate = {
        ...standardTrial,
        source: `${standardTrial.source}+validated`
      };
      baseDecisionTier = "validated-match";
    }
    if (!baseCandidate && standardTrial && hasReliableStandardMatch) {
      const adaptiveConfidence2 = null;
      const gainedStandardCandidate = searchCandidateAlphaGain({
        originalImageData,
        seedCandidate: {
          ...standardTrial,
          source: "standard+validated"
        },
        adaptiveConfidence: adaptiveConfidence2,
        alphaGainCandidates
      });
      if (gainedStandardCandidate) {
        baseCandidate = gainedStandardCandidate;
        baseDecisionTier = "validated-match";
      }
    }
    let adaptive = null;
    let adaptiveConfidence = null;
    let adaptiveTrial = null;
    for (const candidate of standardTrials) {
      if (!candidate || candidate === standardTrial) continue;
      ({
        baseCandidate,
        baseDecisionTier
      } = promoteBaseCandidate(baseCandidate, baseDecisionTier, candidate, {
        reliableMatch: hasReliableStandardWatermarkSignal({
          spatialScore: candidate.originalSpatialScore,
          gradientScore: candidate.originalGradientScore
        })
      }));
    }
    const previewAnchorCandidate = searchBottomRightPreviewCandidate({
      originalImageData,
      config,
      alpha48,
      alpha96,
      getAlphaMap,
      resolveAlphaMap,
      adaptiveConfidence
    });
    if (previewAnchorCandidate) {
      ({
        baseCandidate,
        baseDecisionTier
      } = promoteBaseCandidate(baseCandidate, baseDecisionTier, previewAnchorCandidate));
    }
    if (baseDecisionTier !== "direct-match" && !baseCandidate?.provenance?.previewAnchor && shouldEscalateSearch(baseCandidate)) {
      const sizeJitterCandidate = searchStandardSizeJitterCandidate({
        originalImageData,
        candidateSeeds: standardCandidateSeeds,
        alpha48,
        alpha96,
        getAlphaMap,
        resolveAlphaMap
      });
      if (sizeJitterCandidate) {
        ({
          baseCandidate,
          baseDecisionTier
        } = promoteBaseCandidate(baseCandidate, baseDecisionTier, sizeJitterCandidate));
      }
    }
    if (baseDecisionTier !== "direct-match" && baseCandidate?.provenance?.sizeJitter === true && !baseCandidate?.provenance?.previewAnchor && isStandardCandidateSource(baseCandidate) && shouldEscalateSearch(baseCandidate)) {
      const fineLocalCandidate = searchFineStandardLocalCandidate({
        originalImageData,
        seedCandidate: baseCandidate,
        adaptiveConfidence
      });
      if (fineLocalCandidate) {
        ({
          baseCandidate,
          baseDecisionTier
        } = promoteBaseCandidate(baseCandidate, baseDecisionTier, fineLocalCandidate));
      }
    }
    const shouldEvaluateAdaptive = () => {
      if (!allowAdaptiveSearch || !alpha96) return false;
      if (!baseCandidate) return true;
      if (!shouldEscalateSearch(baseCandidate)) return false;
      baseCandidate = ensureCandidateImageData(baseCandidate, originalImageData);
      return shouldAttemptAdaptiveFallback({
        processedImageData: baseCandidate.imageData,
        alphaMap: baseCandidate.alphaMap,
        position: baseCandidate.position,
        originalImageData,
        originalSpatialMismatchThreshold: 0
      });
    };
    if (shouldEvaluateAdaptive()) {
      ({
        adaptive,
        adaptiveConfidence,
        adaptiveTrial
      } = evaluateAdaptiveTrial({
        originalImageData,
        config,
        alpha96,
        resolveAlphaMap,
        allowAdaptiveSearch
      }));
    }
    if (adaptiveTrial) {
      ({
        baseCandidate,
        baseDecisionTier
      } = promoteBaseCandidate(baseCandidate, baseDecisionTier, adaptiveTrial, {
        reliableMatch: hasReliableAdaptiveWatermarkSignal(adaptive)
      }));
    }
    if (!baseCandidate?.provenance?.previewAnchor && !hasReliableAdaptiveWatermarkSignal(adaptive) && shouldSearchNearbyStandardCandidate(baseCandidate, originalImageData)) {
      const nearbyStandardCandidate = searchNearbyStandardCandidate({
        originalImageData,
        candidateSeeds: standardCandidateSeeds,
        adaptiveConfidence
      });
      if (nearbyStandardCandidate) {
        ({
          baseCandidate,
          baseDecisionTier
        } = promoteBaseCandidate(baseCandidate, baseDecisionTier, nearbyStandardCandidate));
      }
    }
    if (!baseCandidate) {
      if (hasReliableStandardMatch && standardTrial) {
        baseCandidate = standardTrial;
        baseDecisionTier = "direct-match";
      } else if (hasReliableAdaptiveWatermarkSignal(adaptive) && adaptiveTrial) {
        baseCandidate = adaptiveTrial;
        baseDecisionTier = "direct-match";
      }
    }
    if (!baseCandidate) {
      const validatedCandidate = pickBestValidatedCandidate([standardTrial, adaptiveTrial]);
      if (!validatedCandidate) {
        return {
          selectedTrial: null,
          source: "skipped",
          alphaMap: fallbackAlphaMap,
          position,
          config,
          adaptiveConfidence,
          standardSpatialScore,
          standardGradientScore,
          templateWarp: null,
          alphaGain: 1,
          decisionTier: "insufficient"
        };
      }
      baseCandidate = {
        ...validatedCandidate,
        source: `${validatedCandidate.source}+validated`
      };
      baseDecisionTier = "validated-match";
    }
    if (shouldRevertLocalShiftToStandardTrial(baseCandidate, standardTrial)) {
      baseCandidate = standardTrial;
      baseDecisionTier = hasReliableStandardMatch ? "direct-match" : "validated-match";
    }
    const {
      selectedTrial,
      source,
      alphaMap,
      position: refinedPosition,
      config: refinedConfig,
      templateWarp,
      alphaGain,
      decisionTier
    } = refineSelectedAnchorCandidate({
      originalImageData,
      baseCandidate,
      baseDecisionTier,
      adaptiveConfidence,
      alphaGainCandidates
    });
    return {
      selectedTrial: ensureCandidateImageData(selectedTrial, originalImageData),
      source,
      alphaMap,
      position: refinedPosition,
      config: refinedConfig,
      adaptiveConfidence,
      standardSpatialScore,
      standardGradientScore,
      templateWarp,
      alphaGain,
      decisionTier
    };
  }

  // src/core/selectionDebug.js
  function normalizeConfig(config) {
    if (!config || typeof config !== "object") return null;
    const { logoSize, marginRight, marginBottom } = config;
    if (![logoSize, marginRight, marginBottom].every(Number.isFinite)) {
      return null;
    }
    return { logoSize, marginRight, marginBottom };
  }
  function normalizePosition(position) {
    if (!position || typeof position !== "object") return null;
    const { x, y, width, height } = position;
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }
    return { x, y, width, height };
  }
  function createSelectionDebugSummary({
    selectedTrial,
    selectionSource = null,
    initialConfig = null,
    initialPosition = null
  } = {}) {
    if (!selectedTrial) return null;
    const candidateSource = typeof selectionSource === "string" && selectionSource ? selectionSource : typeof selectedTrial.source === "string" ? selectedTrial.source : null;
    return {
      candidateSource,
      initialConfig: normalizeConfig(initialConfig),
      initialPosition: normalizePosition(initialPosition),
      finalConfig: normalizeConfig(selectedTrial.config),
      finalPosition: normalizePosition(selectedTrial.position),
      texturePenalty: Number.isFinite(selectedTrial.texturePenalty) ? selectedTrial.texturePenalty : null,
      tooDark: selectedTrial.tooDark === true,
      tooFlat: selectedTrial.tooFlat === true,
      hardReject: selectedTrial.hardReject === true,
      usedCatalogVariant: selectedTrial.provenance?.catalogVariant === true,
      usedSizeJitter: selectedTrial.provenance?.sizeJitter === true,
      usedLocalShift: selectedTrial.provenance?.localShift === true,
      usedAdaptive: selectedTrial.provenance?.adaptive === true,
      usedPreviewAnchor: selectedTrial.provenance?.previewAnchor === true
    };
  }

  // src/core/watermarkConfig.js
  function detectWatermarkConfig(imageWidth, imageHeight) {
    const officialConfig = resolveOfficialGeminiWatermarkConfig(imageWidth, imageHeight);
    if (officialConfig) {
      return { ...officialConfig };
    }
    if (imageWidth > 1024 && imageHeight > 1024) {
      return {
        logoSize: 96,
        marginRight: 64,
        marginBottom: 64
      };
    }
    return {
      logoSize: 48,
      marginRight: 32,
      marginBottom: 32
    };
  }
  function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;
    return {
      x: imageWidth - marginRight - logoSize,
      y: imageHeight - marginBottom - logoSize,
      width: logoSize,
      height: logoSize
    };
  }
  function getStandardConfig(size) {
    return size === 96 ? { logoSize: 96, marginRight: 64, marginBottom: 64 } : { logoSize: 48, marginRight: 32, marginBottom: 32 };
  }
  function getAlphaMapForConfig(config, alpha48, alpha96) {
    if (!config) return null;
    if (config.logoSize === 48) return alpha48;
    if (config.logoSize === 96) return alpha96;
    return alpha96 ? interpolateAlphaMap(alpha96, 96, config.logoSize) : null;
  }
  function isRegionInsideImage(imageData, region) {
    return region.x >= 0 && region.y >= 0 && region.x + region.width <= imageData.width && region.y + region.height <= imageData.height;
  }
  function resolveInitialStandardConfig({
    imageData,
    defaultConfig,
    alpha48,
    alpha96,
    minSwitchScore = 0.25,
    minScoreDelta = 0.08
  }) {
    if (!imageData || !defaultConfig || !alpha48 || !alpha96) return defaultConfig;
    const fallbackConfig = getStandardConfig(48);
    const primaryConfig = defaultConfig.logoSize === 96 ? getStandardConfig(96) : fallbackConfig;
    const alternateConfig = defaultConfig.logoSize === 96 ? fallbackConfig : getStandardConfig(96);
    const candidateConfigs = [primaryConfig, alternateConfig];
    for (const officialConfig of resolveOfficialGeminiSearchConfigs(imageData.width, imageData.height, {
      limit: 1
    })) {
      if (!candidateConfigs.some((candidate) => candidate.logoSize === officialConfig.logoSize && candidate.marginRight === officialConfig.marginRight && candidate.marginBottom === officialConfig.marginBottom)) {
        candidateConfigs.push(officialConfig);
      }
    }
    let bestConfig = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidateConfig of candidateConfigs) {
      const candidateRegion = calculateWatermarkPosition(
        imageData.width,
        imageData.height,
        candidateConfig
      );
      if (!isRegionInsideImage(imageData, candidateRegion)) continue;
      const alphaMap = getAlphaMapForConfig(candidateConfig, alpha48, alpha96);
      if (!alphaMap) continue;
      const candidateScore = computeRegionSpatialCorrelation({
        imageData,
        alphaMap,
        region: {
          x: candidateRegion.x,
          y: candidateRegion.y,
          size: candidateRegion.width
        }
      });
      if (!bestConfig) {
        bestConfig = candidateConfig;
        bestScore = candidateScore;
        continue;
      }
      if (candidateScore >= minSwitchScore && candidateScore > bestScore + minScoreDelta) {
        bestConfig = candidateConfig;
        bestScore = candidateScore;
      }
    }
    return bestConfig ?? defaultConfig;
  }

  // src/core/watermarkProcessor.js
  var RESIDUAL_RECALIBRATION_THRESHOLD = 0.5;
  var MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION = 0.18;
  var MIN_RECALIBRATION_SCORE_DELTA = 0.18;
  var MAX_NEAR_BLACK_RATIO_INCREASE3 = 0.05;
  var OUTLINE_REFINEMENT_THRESHOLD = 0.42;
  var OUTLINE_REFINEMENT_MIN_GAIN = 1.2;
  var SUBPIXEL_REFINE_SHIFTS = [-0.25, 0, 0.25];
  var SUBPIXEL_REFINE_SCALES = [0.99, 1, 1.01];
  var ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, 1.36, 1.45, 1.52, 1.6, 1.7, 1.85, 2, 2.2, 2.4, 2.6];
  var PREVIEW_EDGE_CLEANUP_MAX_SIZE = 40;
  var PREVIEW_EDGE_CLEANUP_SPATIAL_THRESHOLD = 0.08;
  var PREVIEW_EDGE_CLEANUP_GRADIENT_THRESHOLD = 0.1;
  var PREVIEW_EDGE_CLEANUP_MIN_GRADIENT_IMPROVEMENT = 0.03;
  var PREVIEW_EDGE_CLEANUP_MAX_SPATIAL_DRIFT = 0.04;
  var PREVIEW_EDGE_CLEANUP_MAX_APPLIED_PASSES = 3;
  var PREVIEW_EDGE_CLEANUP_FINE_GRADIENT_THRESHOLD = 0.16;
  var PREVIEW_EDGE_CLEANUP_FINE_MIN_GRADIENT_IMPROVEMENT = 5e-3;
  var PREVIEW_EDGE_CLEANUP_HALO_RELAXED_MIN_GRADIENT_IMPROVEMENT = 0.01;
  var PREVIEW_EDGE_CLEANUP_HALO_WEIGHT = 0.02;
  var PREVIEW_EDGE_CLEANUP_MIN_HALO_REDUCTION = 1.5;
  var PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD = 4;
  var PREVIEW_EDGE_CLEANUP_HALO_SPATIAL_THRESHOLD = 0.18;
  var PREVIEW_EDGE_CLEANUP_PRESETS = Object.freeze([
    { minAlpha: 0.02, maxAlpha: 0.45, radius: 2, strength: 0.7, outsideAlphaMax: 0.05 },
    { minAlpha: 0.05, maxAlpha: 0.55, radius: 3, strength: 0.7, outsideAlphaMax: 0.08 },
    { minAlpha: 0.1, maxAlpha: 0.7, radius: 3, strength: 0.8, outsideAlphaMax: 0.12 },
    { minAlpha: 0.01, maxAlpha: 0.35, radius: 4, strength: 1.4, outsideAlphaMax: 0.05 }
  ]);
  var PREVIEW_EDGE_CLEANUP_STRONG_GRADIENT_THRESHOLD = 0.45;
  var PREVIEW_EDGE_CLEANUP_AGGRESSIVE_PRESETS = Object.freeze([
    {
      minAlpha: 0.01,
      maxAlpha: 0.55,
      radius: 2,
      strength: 1.3,
      outsideAlphaMax: 0.05,
      minGradientImprovement: 0.12,
      maxSpatialDrift: 0.18,
      maxAcceptedSpatial: 0.18
    }
  ]);
  var FIRST_PASS_SIGN_FLIP_GRADIENT_THRESHOLD = 0.08;
  var FIRST_PASS_SIGN_FLIP_MIN_GRADIENT_DROP = 0.2;
  function nowMs() {
    if (typeof globalThis.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }
  function cloneImageData2(imageData) {
    if (typeof ImageData !== "undefined" && imageData instanceof ImageData) {
      return new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
    }
    return {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data)
    };
  }
  function normalizeMetaPosition(position) {
    if (!position) return null;
    const { x, y, width, height } = position;
    if (![x, y, width, height].every((value) => Number.isFinite(value))) {
      return null;
    }
    return { x, y, width, height };
  }
  function normalizeMetaConfig(config) {
    if (!config) return null;
    const { logoSize, marginRight, marginBottom } = config;
    if (![logoSize, marginRight, marginBottom].every((value) => Number.isFinite(value))) {
      return null;
    }
    return { logoSize, marginRight, marginBottom };
  }
  function createWatermarkMeta({
    position = null,
    config = null,
    adaptiveConfidence = null,
    originalSpatialScore = null,
    originalGradientScore = null,
    processedSpatialScore = null,
    processedGradientScore = null,
    suppressionGain = null,
    templateWarp = null,
    alphaGain = 1,
    passCount = 0,
    attemptedPassCount = 0,
    passStopReason = null,
    passes = null,
    source = "standard",
    decisionTier = null,
    applied = true,
    skipReason = null,
    subpixelShift = null,
    selectionDebug = null
  } = {}) {
    const normalizedPosition = normalizeMetaPosition(position);
    return {
      applied,
      skipReason: applied ? null : skipReason,
      size: normalizedPosition ? normalizedPosition.width : null,
      position: normalizedPosition,
      config: normalizeMetaConfig(config),
      detection: {
        adaptiveConfidence,
        originalSpatialScore,
        originalGradientScore,
        processedSpatialScore,
        processedGradientScore,
        suppressionGain
      },
      templateWarp: templateWarp ?? null,
      alphaGain,
      passCount,
      attemptedPassCount,
      passStopReason,
      passes: Array.isArray(passes) ? passes : null,
      // decisionTier is the normalized contract used by UI and attribution.
      // source remains as a verbose execution trace for debugging/tests.
      source,
      decisionTier,
      subpixelShift: subpixelShift ?? null,
      selectionDebug
    };
  }
  function shouldRecalibrateAlphaStrength({ originalScore, processedScore, suppressionGain }) {
    return originalScore >= 0.6 && processedScore >= RESIDUAL_RECALIBRATION_THRESHOLD && suppressionGain <= MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION;
  }
  function shouldStopAfterFirstPass({
    originalSpatialScore,
    originalGradientScore,
    firstPassSpatialScore,
    firstPassGradientScore
  }) {
    if (Math.abs(firstPassSpatialScore) <= 0.25) {
      return true;
    }
    return originalSpatialScore >= 0 && firstPassSpatialScore < 0 && firstPassGradientScore <= FIRST_PASS_SIGN_FLIP_GRADIENT_THRESHOLD && originalGradientScore - firstPassGradientScore >= FIRST_PASS_SIGN_FLIP_MIN_GRADIENT_DROP;
  }
  function refineSubpixelOutline({
    sourceImageData,
    alphaMap,
    position,
    alphaGain,
    originalNearBlackRatio,
    baselineSpatialScore,
    baselineGradientScore,
    baselineShift,
    minGain = OUTLINE_REFINEMENT_MIN_GAIN,
    shiftCandidates = SUBPIXEL_REFINE_SHIFTS,
    scaleCandidates = SUBPIXEL_REFINE_SCALES,
    minGradientImprovement = 0.04,
    maxSpatialDrift = 0.08
  }) {
    const size = position.width;
    if (!size || size <= 8) return null;
    if (alphaGain < minGain) return null;
    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE3);
    const gainCandidates = [alphaGain];
    const lower = Math.max(1, Number((alphaGain - 0.01).toFixed(2)));
    const upper = Number((alphaGain + 0.01).toFixed(2));
    if (lower !== alphaGain) gainCandidates.push(lower);
    if (upper !== alphaGain) gainCandidates.push(upper);
    const baseDx = baselineShift?.dx ?? 0;
    const baseDy = baselineShift?.dy ?? 0;
    const baseScale = baselineShift?.scale ?? 1;
    let best = null;
    for (const scaleDelta of scaleCandidates) {
      const scale = Number((baseScale * scaleDelta).toFixed(4));
      for (const dyDelta of shiftCandidates) {
        const dy = baseDy + dyDelta;
        for (const dxDelta of shiftCandidates) {
          const dx = baseDx + dxDelta;
          const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
          for (const gain of gainCandidates) {
            const candidate = cloneImageData2(sourceImageData);
            removeWatermark(candidate, warped, position, { alphaGain: gain });
            const nearBlackRatio = calculateNearBlackRatio(candidate, position);
            if (nearBlackRatio > maxAllowedNearBlackRatio) continue;
            const spatialScore = computeRegionSpatialCorrelation({
              imageData: candidate,
              alphaMap: warped,
              region: { x: position.x, y: position.y, size }
            });
            const gradientScore = computeRegionGradientCorrelation({
              imageData: candidate,
              alphaMap: warped,
              region: { x: position.x, y: position.y, size }
            });
            const cost = Math.abs(spatialScore) * 0.6 + Math.max(0, gradientScore);
            if (!best || cost < best.cost) {
              best = {
                imageData: candidate,
                alphaMap: warped,
                alphaGain: gain,
                shift: { dx, dy, scale },
                spatialScore,
                gradientScore,
                nearBlackRatio,
                cost
              };
            }
          }
        }
      }
    }
    if (!best) return null;
    const improvedGradient = best.gradientScore <= baselineGradientScore - minGradientImprovement;
    const keptSpatial = Math.abs(best.spatialScore) <= Math.abs(baselineSpatialScore) + maxSpatialDrift;
    if (!improvedGradient || !keptSpatial) return null;
    return best;
  }
  function recalibrateAlphaStrength({
    sourceImageData,
    alphaMap,
    position,
    originalSpatialScore,
    processedSpatialScore,
    originalNearBlackRatio
  }) {
    let bestScore = processedSpatialScore;
    let bestGain = 1;
    let bestImageData = null;
    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE3);
    for (const alphaGain of ALPHA_GAIN_CANDIDATES) {
      const candidate = cloneImageData2(sourceImageData);
      removeWatermark(candidate, alphaMap, position, { alphaGain });
      const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
      if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
        continue;
      }
      const score = computeRegionSpatialCorrelation({
        imageData: candidate,
        alphaMap,
        region: {
          x: position.x,
          y: position.y,
          size: position.width
        }
      });
      if (score < bestScore) {
        bestScore = score;
        bestGain = alphaGain;
        bestImageData = candidate;
      }
    }
    const refinedCandidates = [];
    for (let delta = -0.05; delta <= 0.05; delta += 0.01) {
      refinedCandidates.push(Number((bestGain + delta).toFixed(2)));
    }
    for (const alphaGain of refinedCandidates) {
      if (alphaGain <= 1 || alphaGain >= 3) continue;
      const candidate = cloneImageData2(sourceImageData);
      removeWatermark(candidate, alphaMap, position, { alphaGain });
      const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
      if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
        continue;
      }
      const score = computeRegionSpatialCorrelation({
        imageData: candidate,
        alphaMap,
        region: {
          x: position.x,
          y: position.y,
          size: position.width
        }
      });
      if (score < bestScore) {
        bestScore = score;
        bestGain = alphaGain;
        bestImageData = candidate;
      }
    }
    const scoreDelta = processedSpatialScore - bestScore;
    if (!bestImageData || scoreDelta < MIN_RECALIBRATION_SCORE_DELTA) {
      return null;
    }
    return {
      imageData: bestImageData,
      alphaGain: bestGain,
      processedSpatialScore: bestScore,
      suppressionGain: originalSpatialScore - bestScore
    };
  }
  function shouldRefinePreviewResidualEdge({
    source,
    position,
    baselineSpatialScore,
    baselineGradientScore,
    baselinePositiveHalo
  }) {
    return typeof source === "string" && source.includes("preview-anchor") && position?.width >= 24 && position?.width <= PREVIEW_EDGE_CLEANUP_MAX_SIZE && (Math.abs(baselineSpatialScore) <= PREVIEW_EDGE_CLEANUP_SPATIAL_THRESHOLD || baselinePositiveHalo >= PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD && Math.abs(baselineSpatialScore) <= PREVIEW_EDGE_CLEANUP_HALO_SPATIAL_THRESHOLD) && baselineGradientScore >= PREVIEW_EDGE_CLEANUP_GRADIENT_THRESHOLD;
  }
  function shouldUsePreviewAnchorFastCleanup(selectedTrial, position) {
    return selectedTrial?.provenance?.previewAnchor === true && position?.width >= 24 && position?.width <= PREVIEW_EDGE_CLEANUP_MAX_SIZE;
  }
  function blendPreviewResidualEdge({
    sourceImageData,
    alphaMap,
    position,
    minAlpha,
    maxAlpha,
    radius,
    strength,
    outsideAlphaMax
  }) {
    const candidate = cloneImageData2(sourceImageData);
    const { width: imageWidth, height: imageHeight, data } = sourceImageData;
    const regionSize = position.width;
    const maxAlphaSafe = Math.max(maxAlpha, 1e-6);
    for (let row = 0; row < regionSize; row++) {
      for (let col = 0; col < regionSize; col++) {
        const alpha = alphaMap[row * regionSize + col];
        if (alpha < minAlpha || alpha > maxAlpha) continue;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumWeight = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const localY = row + dy;
            const localX = col + dx;
            const pixelX = position.x + localX;
            const pixelY = position.y + localY;
            if (pixelX < 0 || pixelY < 0 || pixelX >= imageWidth || pixelY >= imageHeight) {
              continue;
            }
            let neighborAlpha = 0;
            if (localY >= 0 && localX >= 0 && localY < regionSize && localX < regionSize) {
              neighborAlpha = alphaMap[localY * regionSize + localX];
            }
            if (neighborAlpha > outsideAlphaMax) continue;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const weight = 1 / distance;
            const pixelIndex2 = (pixelY * imageWidth + pixelX) * 4;
            sumR += data[pixelIndex2] * weight;
            sumG += data[pixelIndex2 + 1] * weight;
            sumB += data[pixelIndex2 + 2] * weight;
            sumWeight += weight;
          }
        }
        if (sumWeight <= 0) continue;
        const blend = Math.max(0, Math.min(1, strength * alpha / maxAlphaSafe));
        const pixelIndex = ((position.y + row) * imageWidth + (position.x + col)) * 4;
        candidate.data[pixelIndex] = Math.round(data[pixelIndex] * (1 - blend) + sumR / sumWeight * blend);
        candidate.data[pixelIndex + 1] = Math.round(data[pixelIndex + 1] * (1 - blend) + sumG / sumWeight * blend);
        candidate.data[pixelIndex + 2] = Math.round(data[pixelIndex + 2] * (1 - blend) + sumB / sumWeight * blend);
      }
    }
    return candidate;
  }
  function refinePreviewResidualEdge({
    sourceImageData,
    alphaMap,
    position,
    source,
    baselineSpatialScore,
    baselineGradientScore,
    minGradientImprovement = PREVIEW_EDGE_CLEANUP_MIN_GRADIENT_IMPROVEMENT,
    maxSpatialDrift = PREVIEW_EDGE_CLEANUP_MAX_SPATIAL_DRIFT,
    allowAggressivePresets = false
  }) {
    const baselineHalo = assessAlphaBandHalo({
      imageData: sourceImageData,
      position,
      alphaMap
    });
    const baselinePositiveHalo = baselineHalo.positiveDeltaLum;
    if (!shouldRefinePreviewResidualEdge({
      source,
      position,
      baselineSpatialScore,
      baselineGradientScore,
      baselinePositiveHalo
    })) {
      return null;
    }
    const baselineNearBlackRatio = calculateNearBlackRatio(sourceImageData, position);
    const maxAllowedNearBlackRatio = Math.min(1, baselineNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE3);
    const resolvedMinGradientImprovement = baselineGradientScore <= PREVIEW_EDGE_CLEANUP_FINE_GRADIENT_THRESHOLD ? PREVIEW_EDGE_CLEANUP_FINE_MIN_GRADIENT_IMPROVEMENT : baselinePositiveHalo >= PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD ? PREVIEW_EDGE_CLEANUP_HALO_RELAXED_MIN_GRADIENT_IMPROVEMENT : minGradientImprovement;
    const presets = allowAggressivePresets && baselineGradientScore >= PREVIEW_EDGE_CLEANUP_STRONG_GRADIENT_THRESHOLD && Math.abs(baselineSpatialScore) <= 0.05 ? [...PREVIEW_EDGE_CLEANUP_PRESETS, ...PREVIEW_EDGE_CLEANUP_AGGRESSIVE_PRESETS] : PREVIEW_EDGE_CLEANUP_PRESETS;
    let best = null;
    for (const preset of presets) {
      const candidate = blendPreviewResidualEdge({
        sourceImageData,
        alphaMap,
        position,
        ...preset
      });
      const nearBlackRatio = calculateNearBlackRatio(candidate, position);
      if (nearBlackRatio > maxAllowedNearBlackRatio) continue;
      const spatialScore = computeRegionSpatialCorrelation({
        imageData: candidate,
        alphaMap,
        region: { x: position.x, y: position.y, size: position.width }
      });
      const gradientScore = computeRegionGradientCorrelation({
        imageData: candidate,
        alphaMap,
        region: { x: position.x, y: position.y, size: position.width }
      });
      const halo = assessAlphaBandHalo({
        imageData: candidate,
        position,
        alphaMap
      });
      const presetMinGradientImprovement = preset.minGradientImprovement ?? resolvedMinGradientImprovement;
      const presetMaxSpatialDrift = preset.maxSpatialDrift ?? maxSpatialDrift;
      const presetMaxAcceptedSpatial = preset.maxAcceptedSpatial ?? 0.22;
      const improvedGradient = gradientScore <= baselineGradientScore - presetMinGradientImprovement;
      const keptSpatial = Math.abs(spatialScore) <= Math.abs(baselineSpatialScore) + presetMaxSpatialDrift;
      const keptResidualWithinTarget = Math.abs(spatialScore) <= presetMaxAcceptedSpatial;
      const candidatePositiveHalo = halo.positiveDeltaLum;
      const improvedHalo = baselinePositiveHalo < PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD || candidatePositiveHalo <= baselinePositiveHalo - PREVIEW_EDGE_CLEANUP_MIN_HALO_REDUCTION;
      if (!improvedGradient || !keptSpatial || !keptResidualWithinTarget || !improvedHalo) continue;
      const cost = Math.abs(spatialScore) * 0.6 + Math.max(0, gradientScore) + candidatePositiveHalo * PREVIEW_EDGE_CLEANUP_HALO_WEIGHT;
      if (!best || cost < best.cost) {
        best = {
          imageData: candidate,
          spatialScore,
          gradientScore,
          halo,
          cost
        };
      }
    }
    return best;
  }
  function processWatermarkImageData(imageData, options = {}) {
    const totalStartedAt = nowMs();
    const debugTimingsEnabled = options.debugTimings === true;
    const debugTimings = debugTimingsEnabled ? {} : null;
    const adaptiveMode = options.adaptiveMode || "auto";
    const allowAdaptiveSearch = adaptiveMode !== "never" && adaptiveMode !== "off";
    const originalImageData = cloneImageData2(imageData);
    const { alpha48, alpha96 } = options;
    const alphaGainCandidates = ALPHA_GAIN_CANDIDATES;
    if (!alpha48 || !alpha96) {
      throw new Error("processWatermarkImageData requires alpha48 and alpha96");
    }
    const defaultConfig = detectWatermarkConfig(originalImageData.width, originalImageData.height);
    const resolvedConfig = resolveInitialStandardConfig({
      imageData: originalImageData,
      defaultConfig,
      alpha48,
      alpha96
    });
    let config = resolvedConfig;
    let position = calculateWatermarkPosition(originalImageData.width, originalImageData.height, config);
    let alphaMap = config.logoSize === 96 ? alpha96 : alpha48;
    let source = "standard";
    let adaptiveConfidence = null;
    let alphaGain = 1;
    let subpixelShift = null;
    let templateWarp = null;
    let decisionTier = null;
    let passCount = 0;
    let attemptedPassCount = 0;
    let passStopReason = null;
    let passes = null;
    const initialSelectionStartedAt = nowMs();
    const initialSelection = selectInitialCandidate({
      originalImageData,
      config,
      position,
      alpha48,
      alpha96,
      getAlphaMap: options.getAlphaMap,
      allowAdaptiveSearch,
      alphaGainCandidates
    });
    if (debugTimingsEnabled) {
      debugTimings.initialSelectionMs = nowMs() - initialSelectionStartedAt;
    }
    if (!initialSelection.selectedTrial) {
      if (debugTimingsEnabled) {
        debugTimings.totalMs = nowMs() - totalStartedAt;
      }
      return {
        imageData: originalImageData,
        meta: createWatermarkMeta({
          adaptiveConfidence: initialSelection.adaptiveConfidence,
          originalSpatialScore: initialSelection.standardSpatialScore,
          originalGradientScore: initialSelection.standardGradientScore,
          processedSpatialScore: initialSelection.standardSpatialScore,
          processedGradientScore: initialSelection.standardGradientScore,
          suppressionGain: 0,
          alphaGain: 1,
          source: "skipped",
          decisionTier: initialSelection.decisionTier ?? "insufficient",
          applied: false,
          skipReason: "no-watermark-detected",
          selectionDebug: null
        }),
        debugTimings
      };
    }
    position = initialSelection.position;
    alphaMap = initialSelection.alphaMap;
    config = initialSelection.config;
    source = initialSelection.source;
    adaptiveConfidence = initialSelection.adaptiveConfidence;
    templateWarp = initialSelection.templateWarp;
    alphaGain = initialSelection.alphaGain;
    decisionTier = initialSelection.decisionTier;
    const selectedTrial = initialSelection.selectedTrial;
    const usePreviewAnchorFastCleanup = shouldUsePreviewAnchorFastCleanup(selectedTrial, position);
    const skipPreviewAnchorMultiPass = selectedTrial?.provenance?.previewAnchor === true;
    let finalImageData = selectedTrial.imageData;
    let originalSpatialScore = selectedTrial.originalSpatialScore;
    let originalGradientScore = selectedTrial.originalGradientScore;
    const firstPassMetricsStartedAt = nowMs();
    const firstPassSpatialScore = computeRegionSpatialCorrelation({
      imageData: finalImageData,
      alphaMap,
      region: { x: position.x, y: position.y, size: position.width }
    });
    const firstPassGradientScore = computeRegionGradientCorrelation({
      imageData: finalImageData,
      alphaMap,
      region: { x: position.x, y: position.y, size: position.width }
    });
    const firstPassNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
    const firstPassRecord = {
      index: 1,
      beforeSpatialScore: originalSpatialScore,
      beforeGradientScore: originalGradientScore,
      afterSpatialScore: firstPassSpatialScore,
      afterGradientScore: firstPassGradientScore,
      improvement: Math.abs(originalSpatialScore) - Math.abs(firstPassSpatialScore),
      gradientDelta: firstPassGradientScore - originalGradientScore,
      nearBlackRatio: firstPassNearBlackRatio
    };
    if (debugTimingsEnabled) {
      debugTimings.firstPassMetricsMs = nowMs() - firstPassMetricsStartedAt;
    }
    const totalMaxPasses = Math.max(
      1,
      options.maxPasses ?? 4
    );
    const remainingPasses = Math.max(0, totalMaxPasses - 1);
    const firstPassClearedResidual = shouldStopAfterFirstPass({
      originalSpatialScore,
      originalGradientScore,
      firstPassSpatialScore,
      firstPassGradientScore
    });
    const extraPassStartedAt = nowMs();
    const extraPassResult = remainingPasses > 0 && !firstPassClearedResidual && !skipPreviewAnchorMultiPass ? removeRepeatedWatermarkLayers({
      imageData: finalImageData,
      alphaMap,
      position,
      maxPasses: remainingPasses,
      startingPassIndex: 1,
      alphaGain
    }) : null;
    if (debugTimingsEnabled) {
      debugTimings.extraPassMs = nowMs() - extraPassStartedAt;
    }
    finalImageData = extraPassResult?.imageData ?? finalImageData;
    passCount = extraPassResult?.passCount ?? 1;
    attemptedPassCount = extraPassResult?.attemptedPassCount ?? 1;
    passStopReason = extraPassResult?.stopReason ?? (firstPassClearedResidual ? "residual-low" : skipPreviewAnchorMultiPass ? "preview-anchor-single-pass" : "max-passes");
    passes = [firstPassRecord, ...extraPassResult?.passes ?? []];
    if (passCount > 1) {
      source = `${source}+multipass`;
    }
    const finalMetricsStartedAt = nowMs();
    const processedSpatialScore = computeRegionSpatialCorrelation({
      imageData: finalImageData,
      alphaMap,
      region: {
        x: position.x,
        y: position.y,
        size: position.width
      }
    });
    const processedGradientScore = computeRegionGradientCorrelation({
      imageData: finalImageData,
      alphaMap,
      region: {
        x: position.x,
        y: position.y,
        size: position.width
      }
    });
    if (debugTimingsEnabled) {
      debugTimings.finalMetricsMs = nowMs() - finalMetricsStartedAt;
    }
    let finalProcessedSpatialScore = processedSpatialScore;
    let finalProcessedGradientScore = processedGradientScore;
    let suppressionGain = originalSpatialScore - finalProcessedSpatialScore;
    const recalibrationStartedAt = nowMs();
    if (shouldRecalibrateAlphaStrength({
      originalScore: originalSpatialScore,
      processedScore: finalProcessedSpatialScore,
      suppressionGain
    })) {
      const originalNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
      const recalibrated = recalibrateAlphaStrength({
        sourceImageData: finalImageData,
        alphaMap,
        position,
        originalSpatialScore,
        processedSpatialScore: finalProcessedSpatialScore,
        originalNearBlackRatio
      });
      if (recalibrated) {
        finalImageData = recalibrated.imageData;
        alphaGain = recalibrated.alphaGain;
        finalProcessedSpatialScore = recalibrated.processedSpatialScore;
        finalProcessedGradientScore = computeRegionGradientCorrelation({
          imageData: finalImageData,
          alphaMap,
          region: {
            x: position.x,
            y: position.y,
            size: position.width
          }
        });
        suppressionGain = recalibrated.suppressionGain;
        source = source === "adaptive" ? "adaptive+gain" : `${source}+gain`;
      }
    }
    if (debugTimingsEnabled) {
      debugTimings.recalibrationMs = nowMs() - recalibrationStartedAt;
    }
    let previewEdgeCleanupElapsedMs = 0;
    const applyPreviewEdgeCleanup = () => {
      const previewEdgeStartedAt = nowMs();
      const previewEdgeRefined = refinePreviewResidualEdge({
        sourceImageData: finalImageData,
        alphaMap,
        position,
        source,
        baselineSpatialScore: finalProcessedSpatialScore,
        baselineGradientScore: finalProcessedGradientScore,
        allowAggressivePresets: usePreviewAnchorFastCleanup
      });
      previewEdgeCleanupElapsedMs += nowMs() - previewEdgeStartedAt;
      if (!previewEdgeRefined) {
        return false;
      }
      finalImageData = previewEdgeRefined.imageData;
      finalProcessedSpatialScore = previewEdgeRefined.spatialScore;
      finalProcessedGradientScore = previewEdgeRefined.gradientScore;
      suppressionGain = originalSpatialScore - finalProcessedSpatialScore;
      source = `${source}+edge-cleanup`;
      return true;
    };
    const subpixelStartedAt = nowMs();
    if (!usePreviewAnchorFastCleanup && finalProcessedSpatialScore <= 0.3 && finalProcessedGradientScore >= OUTLINE_REFINEMENT_THRESHOLD) {
      const originalNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
      const baselineShift = templateWarp ?? { dx: 0, dy: 0, scale: 1 };
      const refined = refineSubpixelOutline({
        sourceImageData: finalImageData,
        alphaMap,
        position,
        alphaGain,
        originalNearBlackRatio,
        baselineSpatialScore: finalProcessedSpatialScore,
        baselineGradientScore: finalProcessedGradientScore,
        baselineShift,
        minGain: OUTLINE_REFINEMENT_MIN_GAIN,
        shiftCandidates: SUBPIXEL_REFINE_SHIFTS,
        scaleCandidates: SUBPIXEL_REFINE_SCALES,
        minGradientImprovement: 0.04,
        maxSpatialDrift: 0.08
      });
      if (refined) {
        finalImageData = refined.imageData;
        alphaMap = refined.alphaMap;
        alphaGain = refined.alphaGain;
        finalProcessedSpatialScore = refined.spatialScore;
        finalProcessedGradientScore = refined.gradientScore;
        suppressionGain = originalSpatialScore - finalProcessedSpatialScore;
        source = `${source}+subpixel`;
        subpixelShift = refined.shift;
      }
    }
    if (debugTimingsEnabled) {
      debugTimings.subpixelRefinementMs = nowMs() - subpixelStartedAt;
    }
    let previewEdgeCleanupPassCount = 0;
    while (previewEdgeCleanupPassCount < PREVIEW_EDGE_CLEANUP_MAX_APPLIED_PASSES) {
      if (!applyPreviewEdgeCleanup()) {
        break;
      }
      previewEdgeCleanupPassCount++;
    }
    if (debugTimingsEnabled) {
      debugTimings.previewEdgeCleanupMs = previewEdgeCleanupElapsedMs;
      debugTimings.totalMs = nowMs() - totalStartedAt;
    }
    return {
      imageData: finalImageData,
      meta: createWatermarkMeta({
        position,
        config,
        adaptiveConfidence,
        originalSpatialScore,
        originalGradientScore,
        processedSpatialScore: finalProcessedSpatialScore,
        processedGradientScore: finalProcessedGradientScore,
        suppressionGain,
        templateWarp,
        alphaGain,
        passCount,
        attemptedPassCount,
        passStopReason,
        passes,
        source,
        decisionTier,
        applied: true,
        subpixelShift,
        selectionDebug: createSelectionDebugSummary({
          selectedTrial,
          selectionSource: initialSelection.source,
          initialConfig: resolvedConfig,
          initialPosition: calculateWatermarkPosition(
            originalImageData.width,
            originalImageData.height,
            resolvedConfig
          )
        })
      }),
      debugTimings
    };
  }

  // src/core/watermarkEngine.js
  function createRuntimeCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(width, height);
    }
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
    throw new Error("Canvas runtime not available");
  }
  function getCanvasContext2D(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }
    return ctx;
  }
  var WatermarkEngine = class _WatermarkEngine {
    constructor() {
      this.alphaMaps = {};
    }
    static async create() {
      return new _WatermarkEngine();
    }
    /**
     * Get alpha map from background captured image based on watermark size
     * @param {number} size - Watermark size (48 or 96)
     * @returns {Promise<Float32Array>} Alpha map
     */
    async getAlphaMap(size) {
      if (size !== 48 && size !== 96) {
        if (this.alphaMaps[size]) return this.alphaMaps[size];
        const alpha96 = await this.getAlphaMap(96);
        const interpolated = interpolateAlphaMap(alpha96, 96, size);
        this.alphaMaps[size] = interpolated;
        return interpolated;
      }
      if (this.alphaMaps[size]) {
        return this.alphaMaps[size];
      }
      const alphaMap = getEmbeddedAlphaMap(size);
      if (!alphaMap) {
        throw new Error(`Missing embedded alpha map for size ${size}`);
      }
      this.alphaMaps[size] = alphaMap;
      return alphaMap;
    }
    /**
     * Remove watermark from image based on watermark size
     * @param {HTMLImageElement|HTMLCanvasElement} image - Input image
     * @returns {Promise<HTMLCanvasElement>} Processed canvas
     */
    async removeWatermarkFromImage(image, options = {}) {
      const now = () => {
        if (typeof globalThis.performance?.now === "function") {
          return globalThis.performance.now();
        }
        return Date.now();
      };
      const canvas = createRuntimeCanvas(image.width, image.height);
      const ctx = getCanvasContext2D(canvas);
      const drawStartedAt = now();
      ctx.drawImage(image, 0, 0);
      const drawMs = now() - drawStartedAt;
      const readStartedAt = now();
      const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const getImageDataMs = now() - readStartedAt;
      const alpha48 = await this.getAlphaMap(48);
      const alpha96 = await this.getAlphaMap(96);
      const processingStartedAt = now();
      const result = processWatermarkImageData(originalImageData, {
        alpha48,
        alpha96,
        adaptiveMode: options.adaptiveMode,
        maxPasses: options.maxPasses,
        debugTimings: options.debugTimings === true,
        getAlphaMap: (size) => this.alphaMaps[size] || interpolateAlphaMap(alpha96, 96, size)
      });
      const processWatermarkImageDataMs = now() - processingStartedAt;
      const writeStartedAt = now();
      ctx.putImageData(result.imageData, 0, 0);
      const putImageDataMs = now() - writeStartedAt;
      canvas.__watermarkMeta = result.meta;
      canvas.__watermarkTiming = {
        drawMs,
        getImageDataMs,
        processWatermarkImageDataMs,
        putImageDataMs,
        processor: result.debugTimings ?? null
      };
      return canvas;
    }
    /**
     * Get watermark information (for display)
     * @param {number} imageWidth - Image width
     * @param {number} imageHeight - Image height
     * @returns {Object} Watermark information {size, position, config}
     */
    getWatermarkInfo(imageWidth, imageHeight) {
      const config = detectWatermarkConfig(imageWidth, imageHeight);
      const position = calculateWatermarkPosition(imageWidth, imageHeight, config);
      return {
        size: config.logoSize,
        position,
        config
      };
    }
  };

  // src/shared/imageProcessing.js
  function loadImageFromObjectUrl(objectUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode Gemini image blob"));
      image.src = objectUrl;
    });
  }
  async function loadRenderableFromBlobFallback(blob, originalError) {
    if (typeof createImageBitmap !== "function") {
      throw originalError;
    }
    try {
      return await createImageBitmap(blob);
    } catch {
      throw originalError;
    }
  }
  async function loadImageFromBlob(blob) {
    const objectUrl = URL.createObjectURL(blob);
    try {
      try {
        return await loadImageFromObjectUrl(objectUrl);
      } catch (error) {
        return await loadRenderableFromBlobFallback(blob, error);
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function withProcessorPath(meta, processorPath) {
    return {
      ...meta && typeof meta === "object" ? meta : {},
      processorPath
    };
  }
  function normalizeProcessorResult(result, processorPath = "main-thread") {
    return {
      processedBlob: result?.processedBlob || null,
      processedMeta: withProcessorPath(result?.processedMeta || null, processorPath)
    };
  }
  function normalizeProcessingOptions(options = {}) {
    return {
      adaptiveMode: "always",
      ...options && typeof options === "object" ? options : {}
    };
  }
  function createCachedImageProcessor({
    createEngine = () => WatermarkEngine.create(),
    encodeCanvas = canvasToBlob,
    processorPath = "main-thread"
  } = {}) {
    let enginePromise = null;
    async function getEngine() {
      if (!enginePromise) {
        enginePromise = Promise.resolve(createEngine()).catch((error) => {
          enginePromise = null;
          throw error;
        });
      }
      return enginePromise;
    }
    return async function processRenderable(image, options = {}) {
      const engine = await getEngine();
      const normalizedOptions = normalizeProcessingOptions(options);
      const canvas = await engine.removeWatermarkFromImage(image, normalizedOptions);
      return {
        processedBlob: await encodeCanvas(canvas),
        processedMeta: withProcessorPath(canvas.__watermarkMeta || null, processorPath)
      };
    };
  }
  function createMainThreadBlobProcessor({
    loadRenderable = loadImageFromBlob,
    processRenderable = createCachedImageProcessor()
  } = {}) {
    return async function processBlobOnMainThread(blob, options = {}) {
      const image = await loadRenderable(blob);
      return processRenderable(image, options);
    };
  }
  function createSharedBlobProcessor({
    processMainThread = createMainThreadBlobProcessor(),
    getWorkerProcessor = null,
    onWorkerError = null
  } = {}) {
    return async function processWithBestPath(blob, options = { adaptiveMode: "always" }) {
      const normalizedOptions = normalizeProcessingOptions(options);
      const processWorker = typeof getWorkerProcessor === "function" ? getWorkerProcessor() : null;
      if (typeof processWorker === "function") {
        try {
          return await processWorker(blob, normalizedOptions);
        } catch (error) {
          onWorkerError?.(error);
        }
      }
      return normalizeProcessorResult(
        await processMainThread(blob, normalizedOptions),
        "main-thread"
      );
    };
  }
  var processWatermarkBlobOnMainThread = createMainThreadBlobProcessor();
  var processWatermarkBlobWithBestPath = createSharedBlobProcessor();
  async function processWatermarkBlob(blob, options = { adaptiveMode: "always" }) {
    return processWatermarkBlobWithBestPath(blob, options);
  }
  async function removeWatermarkFromBlob(blob, options = { adaptiveMode: "always" }) {
    const result = await processWatermarkBlob(blob, options);
    return result.processedBlob;
  }

  // src/shared/pageImageReplacement.js
  var PAGE_IMAGE_STATE_KEY = "gwrPageImageState";
  var PAGE_IMAGE_SOURCE_KEY = "gwrPageImageSource";
  var PAGE_IMAGE_OBJECT_URL_KEY = "gwrWatermarkObjectUrl";
  var PROCESSING_OVERLAY_DATA_KEY = "gwrProcessingOverlay";
  var PROCESSING_VISUAL_DATA_KEY = "gwrProcessingVisual";
  var PREVIEW_OVERLAY_DATA_KEY = "gwrPreviewImage";
  var PAGE_IMAGE_RESPONSE_ID_KEY = "gwrResponseId";
  var PAGE_IMAGE_DRAFT_ID_KEY = "gwrDraftId";
  var PAGE_IMAGE_CONVERSATION_ID_KEY = "gwrConversationId";
  var OBSERVED_ATTRIBUTES = ["src", "srcset", "data-gwr-source-url"];
  var PAGE_FETCH_REQUEST = "gwr:page-fetch-request";
  var PAGE_FETCH_RESPONSE = "gwr:page-fetch-response";
  var PROCESSING_OVERLAY_FADE_MS = 180;
  var PREVIEW_IMAGE_RENDER_RETRY_MS = 1500;
  var RECENT_SOURCE_HINT_TTL_MS = 5e3;
  var MIN_VISIBLE_CAPTURE_EDGE = 32;
  var MIN_VISIBLE_CAPTURE_AREA = MIN_VISIBLE_CAPTURE_EDGE * MIN_VISIBLE_CAPTURE_EDGE;
  var processingOverlayState = /* @__PURE__ */ new WeakMap();
  var previewOverlayState = /* @__PURE__ */ new WeakMap();
  var originalAssetUrlRegistry = /* @__PURE__ */ new Map();
  var previewProcessedResultRegistry = /* @__PURE__ */ new Map();
  var MAX_REMEMBERED_PREVIEW_RESULT_REGISTRY_SIZE = 32;
  function appendLog(onLog, type, payload = {}) {
    if (typeof onLog === "function") {
      onLog(type, payload);
    }
  }
  function isBlobPageImageSource(sourceUrl = "") {
    return typeof sourceUrl === "string" && sourceUrl.startsWith("blob:");
  }
  function isDataPageImageSource(sourceUrl = "") {
    return typeof sourceUrl === "string" && sourceUrl.startsWith("data:");
  }
  function hasExplicitBoundSourceUrl(imageElement, sourceUrl = "") {
    const explicitSourceUrl = typeof imageElement?.dataset?.gwrSourceUrl === "string" ? imageElement.dataset.gwrSourceUrl.trim() : "";
    const normalizedSourceUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
    return Boolean(explicitSourceUrl && normalizedSourceUrl && explicitSourceUrl === normalizedSourceUrl);
  }
  function shouldTreatPageImageSourceAsPreview(imageElement, sourceUrl = "") {
    if (isBlobPageImageSource(sourceUrl)) {
      return true;
    }
    if (!isGeminiDisplayPreviewAssetUrl(sourceUrl)) {
      return false;
    }
    return !hasExplicitBoundSourceUrl(imageElement, sourceUrl);
  }
  function getComparableImageSize(imageElement) {
    const width = Number(imageElement?.naturalWidth) || Number(imageElement?.clientWidth) || Number(imageElement?.width) || 0;
    const height = Number(imageElement?.naturalHeight) || Number(imageElement?.clientHeight) || Number(imageElement?.height) || 0;
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  }
  function readAssetIdsFromImageDataset(imageElement) {
    if (!imageElement?.dataset) {
      return null;
    }
    const responseId = typeof imageElement.dataset[PAGE_IMAGE_RESPONSE_ID_KEY] === "string" ? imageElement.dataset[PAGE_IMAGE_RESPONSE_ID_KEY].trim() : "";
    const draftId = typeof imageElement.dataset[PAGE_IMAGE_DRAFT_ID_KEY] === "string" ? imageElement.dataset[PAGE_IMAGE_DRAFT_ID_KEY].trim() : "";
    const conversationId = typeof imageElement.dataset[PAGE_IMAGE_CONVERSATION_ID_KEY] === "string" ? imageElement.dataset[PAGE_IMAGE_CONVERSATION_ID_KEY].trim() : "";
    if (!responseId && !draftId && !conversationId) {
      return null;
    }
    return {
      responseId: responseId || null,
      draftId: draftId || null,
      conversationId: conversationId || null
    };
  }
  function resolveImageSessionSurfaceType(imageElement) {
    if (typeof imageElement?.closest === "function") {
      if (imageElement.closest('expansion-dialog,[role="dialog"],.image-expansion-dialog-panel,.cdk-overlay-pane')) {
        return "fullscreen";
      }
    }
    return "preview";
  }
  function getAspectRatioDelta(left, right) {
    if (!left || !right) return 0;
    return Math.abs(left.width / left.height - right.width / right.height);
  }
  function getRenderableComparableSize(renderable) {
    const width = Number(renderable?.naturalWidth) || Number(renderable?.width) || 0;
    const height = Number(renderable?.naturalHeight) || Number(renderable?.height) || 0;
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  }
  function shouldRejectPreviewOriginalBlobByAspectRatio(renderable, imageElement, {
    maxAspectRatioDelta = 0.02
  } = {}) {
    const renderableSize = getRenderableComparableSize(renderable);
    const previewSize = getComparableImageSize(imageElement);
    if (!renderableSize || !previewSize) {
      return false;
    }
    return getAspectRatioDelta(renderableSize, previewSize) > maxAspectRatioDelta;
  }
  function hasAnyAssetIds(assetIds = null) {
    return Boolean(assetIds?.responseId || assetIds?.draftId || assetIds?.conversationId);
  }
  function buildRecentImageSourceHint(imageElement, {
    now = Date.now(),
    resolveSourceUrl = resolveCandidateImageUrl,
    resolveAssetIds = extractGeminiImageAssetIds
  } = {}) {
    const assetIds = typeof resolveAssetIds === "function" ? resolveAssetIds(imageElement) : null;
    const sourceUrl = typeof resolveSourceUrl === "function" ? String(resolveSourceUrl(imageElement) || "").trim() : "";
    const hasUsableSourceUrl = Boolean(sourceUrl) && !isBlobPageImageSource(sourceUrl) && !isDataPageImageSource(sourceUrl);
    if (!hasUsableSourceUrl && !hasAnyAssetIds(assetIds)) {
      return null;
    }
    return {
      sourceUrl: hasUsableSourceUrl ? sourceUrl : "",
      createdAt: Number(now) || 0,
      size: getComparableImageSize(imageElement),
      assetIds
    };
  }
  function isRecentImageSourceHintFresh(hint, now = Date.now()) {
    if (!hint || typeof hint !== "object") return false;
    const createdAt = Number(hint.createdAt) || 0;
    const currentNow = Number(now) || 0;
    return createdAt > 0 && currentNow >= createdAt && currentNow - createdAt <= RECENT_SOURCE_HINT_TTL_MS;
  }
  function applyRecentImageSourceHintToImage(imageElement, hint, {
    now = Date.now()
  } = {}) {
    if (!isRecentImageSourceHintFresh(hint, now) || !imageElement || typeof imageElement !== "object") {
      return false;
    }
    const dataset = imageElement.dataset || (imageElement.dataset = {});
    const currentSourceUrl = resolveCandidateImageUrl(imageElement);
    if (!isBlobPageImageSource(currentSourceUrl) && !isDataPageImageSource(currentSourceUrl)) {
      return false;
    }
    const imageAssetIds = extractGeminiImageAssetIds(imageElement);
    if (hasAnyAssetIds(imageAssetIds)) {
      if (!hasAnyAssetIds(hint.assetIds) || !assetIdsMatch(imageAssetIds, hint.assetIds)) {
        return false;
      }
    }
    const hintSize = hint.size;
    const imageSize = getComparableImageSize(imageElement);
    if (hintSize && imageSize && getAspectRatioDelta(hintSize, imageSize) > 0.02) {
      return false;
    }
    let applied = false;
    const rememberedSourceUrl = !hint.sourceUrl && hasAnyAssetIds(hint.assetIds) ? resolveRememberedOriginalAssetUrl(hint.assetIds) : "";
    const resolvedHintSourceUrl = hint.sourceUrl || rememberedSourceUrl;
    if (resolvedHintSourceUrl && !(typeof dataset.gwrSourceUrl === "string" && dataset.gwrSourceUrl.trim())) {
      dataset.gwrSourceUrl = resolvedHintSourceUrl;
      applied = true;
    }
    if (!dataset[PAGE_IMAGE_RESPONSE_ID_KEY] && hint.assetIds?.responseId) {
      dataset[PAGE_IMAGE_RESPONSE_ID_KEY] = hint.assetIds.responseId;
      applied = true;
    }
    if (!dataset[PAGE_IMAGE_DRAFT_ID_KEY] && hint.assetIds?.draftId) {
      dataset[PAGE_IMAGE_DRAFT_ID_KEY] = hint.assetIds.draftId;
      applied = true;
    }
    if (!dataset[PAGE_IMAGE_CONVERSATION_ID_KEY] && hint.assetIds?.conversationId) {
      dataset[PAGE_IMAGE_CONVERSATION_ID_KEY] = hint.assetIds.conversationId;
      applied = true;
    }
    return applied;
  }
  function resolveHintSourceImageFromEventTarget(target) {
    if (!target || typeof target !== "object") {
      return null;
    }
    const normalizedTagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
    if (normalizedTagName === "IMG" && isProcessableGeminiImageElement(target)) {
      return target;
    }
    const queryRoot = typeof target.closest === "function" ? target.closest(getGeminiImageContainerSelector()) || target.closest("single-image") || target.closest("[data-test-draft-id]") : null;
    if (!queryRoot || typeof queryRoot.querySelector !== "function") {
      return null;
    }
    return queryRoot.querySelector("img");
  }
  function emitPageImageProcessEvent({
    logger,
    onLog,
    level = "info",
    consoleMessage,
    eventType,
    payload
  }) {
    logger?.[level]?.(consoleMessage, payload);
    appendLog(onLog, eventType, payload);
  }
  function nowMs2() {
    if (typeof globalThis.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }
  function getErrorCandidateDiagnostics(error) {
    return Array.isArray(error?.candidateDiagnostics) ? error.candidateDiagnostics : null;
  }
  function getErrorCandidateDiagnosticsSummary(error) {
    return typeof error?.candidateDiagnosticsSummary === "string" ? error.candidateDiagnosticsSummary : "";
  }
  function getDraftAssetRegistryKey(assetIds = null) {
    const draftId = typeof assetIds?.draftId === "string" ? assetIds.draftId.trim() : "";
    return draftId ? `draft:${draftId}` : "";
  }
  function getResponseAssetRegistryKey(assetIds = null) {
    const responseId = typeof assetIds?.responseId === "string" ? assetIds.responseId.trim() : "";
    const conversationId = typeof assetIds?.conversationId === "string" ? assetIds.conversationId.trim() : "";
    return responseId && conversationId ? `response:${responseId}|conversation:${conversationId}` : "";
  }
  function rememberOriginalAssetUrlBinding(assetIds = null, sourceUrl = "", {
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
    if (!assetIds || !normalizedSourceUrl) {
      return;
    }
    const draftKey = getDraftAssetRegistryKey(assetIds);
    const responseKey = getResponseAssetRegistryKey(assetIds);
    if (draftKey) {
      originalAssetUrlRegistry.set(draftKey, normalizedSourceUrl);
    }
    if (responseKey) {
      originalAssetUrlRegistry.set(responseKey, normalizedSourceUrl);
    }
    const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
    if (sessionKey) {
      imageSessionStore.updateOriginalSource?.(sessionKey, normalizedSourceUrl);
    }
  }
  function resolveRememberedOriginalAssetUrl(assetIds = null) {
    if (!assetIds) {
      return "";
    }
    const draftKey = getDraftAssetRegistryKey(assetIds);
    if (draftKey && originalAssetUrlRegistry.has(draftKey)) {
      return originalAssetUrlRegistry.get(draftKey) || "";
    }
    const responseKey = getResponseAssetRegistryKey(assetIds);
    if (responseKey && originalAssetUrlRegistry.has(responseKey)) {
      return originalAssetUrlRegistry.get(responseKey) || "";
    }
    return "";
  }
  function resolveRememberedPreviewSourceUrl(assetIds = null, {
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
    if (!sessionKey) {
      return "";
    }
    const previewUrl = imageSessionStore?.getSnapshot?.(sessionKey)?.sources?.previewUrl || "";
    return typeof previewUrl === "string" ? previewUrl.trim() : "";
  }
  function trimRememberedPreviewResultRegistry() {
    while (previewProcessedResultRegistry.size > MAX_REMEMBERED_PREVIEW_RESULT_REGISTRY_SIZE) {
      const oldestKey = previewProcessedResultRegistry.keys().next().value;
      if (typeof oldestKey !== "string" || !oldestKey) {
        break;
      }
      previewProcessedResultRegistry.delete(oldestKey);
    }
  }
  function rememberProcessedPreviewResult(sourceUrl = "", payload = {}, {
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? normalizeGoogleusercontentImageUrl(sourceUrl.trim()) : "";
    const sessionKey = typeof payload?.sessionKey === "string" && payload.sessionKey.trim() ? payload.sessionKey.trim() : imageSessionStore?.getOrCreateByAssetIds?.(payload?.assetIds) || "";
    if (!normalizedSourceUrl || !sessionKey) {
      return "";
    }
    previewProcessedResultRegistry.delete(normalizedSourceUrl);
    previewProcessedResultRegistry.set(normalizedSourceUrl, {
      sourceUrl: normalizedSourceUrl,
      sessionKey,
      processedMeta: payload?.processedMeta ?? null,
      processedFrom: typeof payload?.processedFrom === "string" && payload.processedFrom.trim() ? payload.processedFrom.trim() : "request-preview"
    });
    trimRememberedPreviewResultRegistry();
    return normalizedSourceUrl;
  }
  function resolveRememberedProcessedPreviewResult(sourceUrl = "", {
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? normalizeGoogleusercontentImageUrl(sourceUrl.trim()) : "";
    if (!normalizedSourceUrl) {
      return null;
    }
    const rememberedEntry = previewProcessedResultRegistry.get(normalizedSourceUrl) || null;
    if (!rememberedEntry?.sessionKey) {
      return null;
    }
    const rememberedResource = imageSessionStore?.getBestResource?.(rememberedEntry.sessionKey, "display") || null;
    if (rememberedResource?.kind !== "processed" || rememberedResource.slot !== "preview" || !(rememberedResource.blob instanceof Blob)) {
      return null;
    }
    return {
      sourceUrl: normalizedSourceUrl,
      sessionKey: rememberedEntry.sessionKey,
      processedBlob: rememberedResource.blob,
      processedMeta: rememberedResource.processedMeta ?? rememberedEntry.processedMeta ?? null,
      processedFrom: rememberedResource.source || rememberedEntry.processedFrom || "request-preview"
    };
  }
  function createPreviewCandidateProcessor(processWatermarkBlobImpl, processingOptions = null) {
    return async (candidate) => {
      const originalBlob = await candidate.getOriginalBlob();
      try {
        const captureTiming = originalBlob?.__gwrCaptureTiming || null;
        const processedResult = await processWatermarkBlobImpl(
          originalBlob,
          processingOptions ? { ...processingOptions } : void 0
        );
        return {
          ...processedResult,
          captureTiming,
          sourceBlobType: originalBlob.type || "",
          sourceBlobSize: originalBlob.size || 0
        };
      } catch (error) {
        if (error && typeof error === "object") {
          error.sourceBlobType = originalBlob.type || "";
          error.sourceBlobSize = originalBlob.size || 0;
        }
        throw error;
      }
    };
  }
  async function fetchBlobDirect(url) {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    return response.blob();
  }
  async function fetchBlobFromBackground(url, fallbackFetchBlob = null) {
    if (typeof fallbackFetchBlob === "function") {
      return fallbackFetchBlob(url);
    }
    return fetchBlobDirect(url);
  }
  var pageFetchRequestCounter = 0;
  async function fetchBlobViaPageBridge(url, timeoutMs = 15e3) {
    if (typeof window === "undefined" || typeof window.postMessage !== "function" || typeof window.addEventListener !== "function") {
      throw new Error("Page fetch bridge unavailable");
    }
    const requestId = `gwr-page-fetch-${Date.now()}-${pageFetchRequestCounter += 1}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        globalThis.clearTimeout(timeoutId);
      };
      const handleMessage = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== PAGE_FETCH_RESPONSE) return;
        if (event.data?.requestId !== requestId) return;
        cleanup();
        if (event.data?.ok === false) {
          reject(new Error(normalizeErrorMessage(event.data?.error, "Page fetch failed")));
          return;
        }
        const blobMimeType = resolveFetchedImageMimeType(event.data?.mimeType, event.data?.buffer);
        resolve(new Blob([event.data.buffer], { type: blobMimeType }));
      };
      const timeoutId = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error("Page fetch bridge timed out"));
      }, timeoutMs);
      window.addEventListener("message", handleMessage);
      window.postMessage({
        type: PAGE_FETCH_REQUEST,
        requestId,
        url
      }, "*");
    });
  }
  async function imageElementToBlob(imageElement) {
    const startedAt = nowMs2();
    const waitStartedAt = nowMs2();
    const { width, height } = await waitForRenderableImageSize(imageElement);
    const waitRenderableMs = nowMs2() - waitStartedAt;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context unavailable");
    }
    const drawStartedAt = nowMs2();
    context.drawImage(imageElement, 0, 0, width, height);
    const drawMs = nowMs2() - drawStartedAt;
    const encodeStartedAt = nowMs2();
    const blob = await canvasToBlob(canvas);
    const encodeMs = nowMs2() - encodeStartedAt;
    blob.__gwrCaptureTiming = {
      waitRenderableMs,
      drawMs,
      encodeMs,
      totalMs: nowMs2() - startedAt,
      width,
      height
    };
    return blob;
  }
  function normalizeCaptureRect(rect) {
    if (!rect || typeof rect !== "object") return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (![left, top, width, height].every(Number.isFinite)) {
      return null;
    }
    return {
      left,
      top,
      width: Math.max(0, width),
      height: Math.max(0, height)
    };
  }
  function waitForNextFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }
      globalThis.setTimeout(resolve, 16);
    });
  }
  function getRenderableImageSize(imageElement) {
    const width = Number(imageElement?.naturalWidth) || Number(imageElement?.width) || Number(imageElement?.clientWidth) || 0;
    const height = Number(imageElement?.naturalHeight) || Number(imageElement?.height) || Number(imageElement?.clientHeight) || 0;
    return { width, height };
  }
  function isPreviewImageRenderable(imageElement) {
    return Boolean(imageElement?.complete) && (Number(imageElement?.naturalWidth) || 0) > 0 && (Number(imageElement?.naturalHeight) || 0) > 0;
  }
  async function waitForRenderableImageSize(imageElement, timeoutMs = 1500) {
    let size = getRenderableImageSize(imageElement);
    if (size.width > 0 && size.height > 0) {
      return size;
    }
    if (typeof imageElement?.decode === "function") {
      try {
        await imageElement.decode();
      } catch {
      }
      size = getRenderableImageSize(imageElement);
      if (size.width > 0 && size.height > 0) {
        return size;
      }
    }
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() < deadline) {
      await waitForNextFrame();
      size = getRenderableImageSize(imageElement);
      if (size.width > 0 && size.height > 0) {
        return size;
      }
    }
    throw new Error("Image has no renderable size");
  }
  function hasConfirmedGeminiPreviewMeta(processedMeta) {
    return classifyGeminiAttributionFromWatermarkMeta(processedMeta).tier !== "insufficient";
  }
  function isSafePreviewFallbackStrategy(strategy) {
    return strategy === "rendered-capture";
  }
  function isBlobLike(value) {
    return Boolean(value) && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.arrayBuffer === "function";
  }
  function summarizeCandidateDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
      return "";
    }
    return diagnostics.map((item) => {
      const parts = [item.strategy || "unknown", item.status || "unknown"];
      if (item.decisionTier) parts.push(`tier=${item.decisionTier}`);
      if (item.processorPath) parts.push(`processor=${item.processorPath}`);
      if (typeof item.sourceBlobSize === "number") parts.push(`sourceSize=${item.sourceBlobSize}`);
      if (item.sourceBlobType) parts.push(`sourceType=${item.sourceBlobType}`);
      if (typeof item.processedBlobSize === "number") parts.push(`processedSize=${item.processedBlobSize}`);
      if (item.processedBlobType) parts.push(`processedType=${item.processedBlobType}`);
      if (item.error) parts.push(`error=${item.error}`);
      return parts.join(",");
    }).join(" | ");
  }
  function shouldSkipPreviewProcessingFailure(diagnostics = []) {
    if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
      return false;
    }
    const pageFetchFailure = diagnostics.find((item) => item?.strategy === "page-fetch");
    const renderedCaptureFailure = diagnostics.find((item) => item?.strategy === "rendered-capture");
    const pageFetchError = String(pageFetchFailure?.error || "");
    const renderedCaptureError = String(renderedCaptureFailure?.error || "");
    return pageFetchFailure?.status === "error" && /failed to fetch image: 403/i.test(pageFetchError) && renderedCaptureFailure?.status === "error" && /tainted canvases may not be exported/i.test(renderedCaptureError);
  }
  async function resolvePreviewReplacementResult({
    candidates = [],
    processCandidate
  }) {
    let lastError = null;
    let sawInsufficientCandidate = false;
    let fallbackResult = null;
    const diagnostics = [];
    for (const candidate of candidates) {
      try {
        const result = await processCandidate(candidate);
        const confirmed = hasConfirmedGeminiPreviewMeta(result?.processedMeta);
        const decisionTier = classifyGeminiAttributionFromWatermarkMeta(result?.processedMeta).tier || "insufficient";
        diagnostics.push({
          strategy: candidate.strategy || "",
          status: confirmed ? "confirmed" : "insufficient",
          decisionTier,
          captureTiming: result?.captureTiming || null,
          processorPath: typeof result?.processedMeta?.processorPath === "string" ? result.processedMeta.processorPath : "",
          sourceBlobType: result?.sourceBlobType || "",
          sourceBlobSize: typeof result?.sourceBlobSize === "number" ? result.sourceBlobSize : void 0,
          processedBlobType: result?.processedBlob?.type || "",
          processedBlobSize: typeof result?.processedBlob?.size === "number" ? result.processedBlob.size : void 0
        });
        if (confirmed) {
          return {
            ...result,
            strategy: candidate.strategy || "",
            diagnostics,
            diagnosticsSummary: summarizeCandidateDiagnostics(diagnostics)
          };
        }
        sawInsufficientCandidate = true;
        if (isSafePreviewFallbackStrategy(candidate.strategy) && isBlobLike(result?.processedBlob)) {
          const nextFallbackResult = {
            ...result,
            strategy: candidate.strategy || "",
            diagnostics: [...diagnostics],
            diagnosticsSummary: summarizeCandidateDiagnostics(diagnostics)
          };
          if (!fallbackResult) {
            fallbackResult = nextFallbackResult;
          }
        }
      } catch (error2) {
        lastError = error2;
        diagnostics.push({
          strategy: candidate.strategy || "",
          status: "error",
          sourceBlobType: typeof error2?.sourceBlobType === "string" ? error2.sourceBlobType : "",
          sourceBlobSize: typeof error2?.sourceBlobSize === "number" ? error2.sourceBlobSize : void 0,
          error: normalizeErrorMessage(error2)
        });
      }
    }
    if (fallbackResult) {
      return fallbackResult;
    }
    if (lastError) {
      const wrappedError = new Error(normalizeErrorMessage(lastError, "Preview candidate failed"));
      wrappedError.candidateDiagnostics = diagnostics;
      wrappedError.candidateDiagnosticsSummary = summarizeCandidateDiagnostics(diagnostics);
      throw wrappedError;
    }
    if (sawInsufficientCandidate) {
      const error2 = new Error("No confirmed Gemini preview candidate succeeded");
      error2.candidateDiagnostics = diagnostics;
      error2.candidateDiagnosticsSummary = summarizeCandidateDiagnostics(diagnostics);
      throw error2;
    }
    const error = new Error("No preview candidate succeeded");
    error.candidateDiagnostics = diagnostics;
    error.candidateDiagnosticsSummary = summarizeCandidateDiagnostics(diagnostics);
    throw error;
  }
  function buildPreviewReplacementCandidates({
    imageElement,
    sourceUrl = "",
    fetchPreviewBlob = fetchBlobViaPageBridge,
    captureRenderedImageBlob = imageElementToBlob
  }) {
    const candidates = [];
    const normalizedPreviewUrl = sourceUrl ? normalizeGoogleusercontentImageUrl(sourceUrl) : "";
    if (typeof fetchPreviewBlob === "function" && normalizedPreviewUrl) {
      candidates.push({
        strategy: "page-fetch",
        getOriginalBlob: () => fetchPreviewBlob(normalizedPreviewUrl)
      });
    }
    if (typeof captureRenderedImageBlob === "function") {
      candidates.push({
        strategy: "rendered-capture",
        getOriginalBlob: () => captureRenderedImageBlob(imageElement)
      });
    }
    return candidates;
  }
  async function processPreviewPageImageSource({
    sourceUrl,
    imageElement,
    fetchPreviewBlob = fetchBlobViaPageBridge,
    processWatermarkBlobImpl = processWatermarkBlob,
    captureRenderedImageBlob = imageElementToBlob
  }) {
    try {
      const previewResult = await resolvePreviewReplacementResult({
        candidates: buildPreviewReplacementCandidates({
          imageElement,
          sourceUrl,
          fetchPreviewBlob,
          captureRenderedImageBlob
        }),
        processCandidate: createPreviewCandidateProcessor(processWatermarkBlobImpl)
      });
      return {
        skipped: false,
        processedBlob: previewResult.processedBlob,
        selectedStrategy: previewResult.strategy || "",
        candidateDiagnostics: previewResult.diagnostics || null,
        candidateDiagnosticsSummary: previewResult.diagnosticsSummary || "",
        captureTiming: previewResult.captureTiming || null
      };
    } catch (error) {
      const diagnostics = getErrorCandidateDiagnostics(error) || [];
      if (shouldSkipPreviewProcessingFailure(diagnostics)) {
        return {
          skipped: true,
          reason: "preview-fetch-unavailable",
          candidateDiagnostics: diagnostics,
          candidateDiagnosticsSummary: getErrorCandidateDiagnosticsSummary(error)
        };
      }
      throw error;
    }
  }
  async function processOriginalPageImageSource({
    sourceUrl,
    imageElement,
    fetchPreviewBlob = fetchBlobViaPageBridge,
    removeWatermarkFromBlobImpl = removeWatermarkFromBlob,
    captureRenderedImageBlob = imageElementToBlob,
    fetchBlobDirectImpl = fetchBlobDirect,
    validateBlob = loadImageFromBlob,
    fetchBlobFromBackgroundImpl = fetchBlobFromBackground,
    preferRenderedCaptureForPreview = true,
    allowRenderedCaptureFallbackOnValidationFailure = true,
    rejectPreviewAspectMismatch = false
  }) {
    let validatedRenderable = null;
    const validateOriginalBlob = typeof validateBlob === "function" ? async (blob) => {
      const renderable = await validateBlob(blob);
      validatedRenderable = renderable;
      return renderable;
    } : null;
    const originalBlob = await acquireOriginalBlob({
      sourceUrl,
      image: imageElement,
      fetchBlobFromBackground: async (url) => fetchBlobFromBackgroundImpl(
        normalizeGoogleusercontentImageUrl(url),
        fetchPreviewBlob
      ),
      fetchBlobDirect: fetchBlobDirectImpl,
      captureRenderedImageBlob,
      validateBlob: validateOriginalBlob,
      preferRenderedCaptureForPreview,
      preferRenderedCaptureForBlobUrl: true,
      allowRenderedCaptureFallbackOnValidationFailure
    });
    if (rejectPreviewAspectMismatch && shouldRejectPreviewOriginalBlobByAspectRatio(validatedRenderable, imageElement)) {
      throw new Error("Preview source aspect ratio mismatches visible preview");
    }
    return {
      skipped: false,
      processedBlob: await removeWatermarkFromBlobImpl(originalBlob),
      selectedStrategy: "",
      candidateDiagnostics: null,
      candidateDiagnosticsSummary: ""
    };
  }
  async function processPageImageSource({
    sourceUrl,
    imageElement,
    fetchPreviewBlob = fetchBlobViaPageBridge,
    processWatermarkBlobImpl = processWatermarkBlob,
    removeWatermarkFromBlobImpl = removeWatermarkFromBlob,
    captureRenderedImageBlob = imageElementToBlob,
    fetchBlobDirectImpl = fetchBlobDirect,
    validateBlob = loadImageFromBlob,
    fetchBlobFromBackgroundImpl = fetchBlobFromBackground
  }) {
    const treatAsPreviewSource = shouldTreatPageImageSourceAsPreview(imageElement, sourceUrl);
    if (treatAsPreviewSource) {
      if (!isBlobPageImageSource(sourceUrl) && isGeminiDisplayPreviewAssetUrl(sourceUrl)) {
        try {
          return await processOriginalPageImageSource({
            sourceUrl,
            imageElement,
            fetchPreviewBlob,
            removeWatermarkFromBlobImpl,
            captureRenderedImageBlob,
            fetchBlobDirectImpl,
            validateBlob,
            fetchBlobFromBackgroundImpl,
            preferRenderedCaptureForPreview: false,
            rejectPreviewAspectMismatch: true
          });
        } catch {
        }
      }
      return processPreviewPageImageSource({
        sourceUrl,
        imageElement,
        fetchPreviewBlob: isBlobPageImageSource(sourceUrl) ? null : fetchPreviewBlob,
        processWatermarkBlobImpl,
        captureRenderedImageBlob
      });
    }
    return processOriginalPageImageSource({
      sourceUrl,
      imageElement,
      fetchPreviewBlob,
      removeWatermarkFromBlobImpl,
      captureRenderedImageBlob,
      fetchBlobDirectImpl,
      validateBlob,
      fetchBlobFromBackgroundImpl,
      preferRenderedCaptureForPreview: isGeminiDisplayPreviewAssetUrl(sourceUrl) && !hasExplicitBoundSourceUrl(imageElement, sourceUrl)
    });
  }
  function addProcessableCandidateImage(candidates, imageElement) {
    if (isProcessableGeminiImageElement(imageElement)) {
      candidates.add(imageElement);
    }
  }
  function collectCandidateImages(root) {
    const candidates = /* @__PURE__ */ new Set();
    if (root instanceof HTMLImageElement) {
      addProcessableCandidateImage(candidates, root);
    }
    if (typeof root?.querySelectorAll === "function") {
      for (const image of root.querySelectorAll(getGeminiImageQuerySelector())) {
        addProcessableCandidateImage(candidates, image);
      }
      for (const image of root.querySelectorAll("img")) {
        addProcessableCandidateImage(candidates, image);
      }
    }
    return [...candidates];
  }
  function hasRelevantDescendant(root) {
    if (!root || typeof root.querySelector !== "function") {
      return false;
    }
    const containerSelector = getGeminiImageContainerSelector();
    if (root.querySelector(containerSelector)) {
      return true;
    }
    return Boolean(root.querySelector("img") && root.querySelector('button,[role="button"]'));
  }
  function shouldScheduleMutationRoot(root) {
    if (!root || typeof root !== "object") {
      return false;
    }
    const tagName = typeof root.tagName === "string" ? root.tagName.toUpperCase() : "";
    if (!tagName) {
      return false;
    }
    if (tagName === "IMG" || tagName === "GENERATED-IMAGE") {
      return true;
    }
    const containerSelector = getGeminiImageContainerSelector();
    if (typeof root.matches === "function" && root.matches(containerSelector)) {
      return true;
    }
    return hasRelevantDescendant(root);
  }
  function shouldScheduleAttributeMutation(target, attributeName = "") {
    if (!target || typeof target !== "object") {
      return false;
    }
    const normalizedAttributeName = typeof attributeName === "string" ? attributeName.trim().toLowerCase() : "";
    if (!normalizedAttributeName) {
      return true;
    }
    if (normalizedAttributeName === "data-gwr-stable-source") {
      return false;
    }
    if (normalizedAttributeName !== "src" && normalizedAttributeName !== "srcset") {
      return true;
    }
    return !isSelfWrittenProcessedImageSource(target);
  }
  function isSelfWrittenProcessedImageSource(target) {
    const trackedObjectUrl = typeof target?.dataset?.[PAGE_IMAGE_OBJECT_URL_KEY] === "string" ? target.dataset[PAGE_IMAGE_OBJECT_URL_KEY].trim() : "";
    if (!trackedObjectUrl) {
      return false;
    }
    const currentSrc = typeof target?.currentSrc === "string" ? target.currentSrc.trim() : "";
    const src = typeof target?.src === "string" ? target.src.trim() : "";
    return currentSrc === trackedObjectUrl || src === trackedObjectUrl;
  }
  function handlePageImageMutations(mutations, {
    scheduleProcess,
    HTMLImageElementClass = globalThis.HTMLImageElement
  } = {}) {
    if (typeof scheduleProcess !== "function" || !Array.isArray(mutations) || mutations.length === 0) {
      return;
    }
    const hasImageElementClass = typeof HTMLImageElementClass === "function";
    for (const mutation of mutations) {
      if (mutation?.type === "attributes") {
        if (!hasImageElementClass || !(mutation.target instanceof HTMLImageElementClass)) {
          continue;
        }
        if (!shouldScheduleAttributeMutation(mutation.target, mutation.attributeName)) {
          continue;
        }
        scheduleProcess(mutation.target);
        continue;
      }
      if (mutation?.type !== "childList" || !mutation.addedNodes) {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (shouldScheduleMutationRoot(node)) {
          scheduleProcess(node);
        }
      }
    }
  }
  function scheduleOnNextFrame(callback) {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => callback());
      return;
    }
    globalThis.setTimeout(callback, 16);
  }
  function scheduleOnIdle(callback) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => callback(), { timeout: 120 });
      return;
    }
    globalThis.setTimeout(callback, 32);
  }
  function doesRootContain(containerRoot, candidateRoot) {
    if (!containerRoot || !candidateRoot || containerRoot === candidateRoot) {
      return false;
    }
    if (typeof containerRoot.contains === "function") {
      try {
        return containerRoot.contains(candidateRoot);
      } catch {
        return false;
      }
    }
    return false;
  }
  function createRootBatchProcessor({
    processRoot,
    scheduleFlush = scheduleOnNextFrame
  } = {}) {
    const pendingRoots = /* @__PURE__ */ new Set();
    let scheduled = false;
    function flush() {
      scheduled = false;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      for (const root of roots) {
        processRoot(root);
      }
    }
    function schedule(root = document) {
      for (const pendingRoot of pendingRoots) {
        if (pendingRoot === root || doesRootContain(pendingRoot, root)) {
          return;
        }
      }
      for (const pendingRoot of [...pendingRoots]) {
        if (doesRootContain(root, pendingRoot)) {
          pendingRoots.delete(pendingRoot);
        }
      }
      pendingRoots.add(root);
      if (scheduled) return;
      scheduled = true;
      scheduleFlush(flush);
    }
    return {
      schedule,
      flush
    };
  }
  function createProcessingOverlayElement(createElement) {
    const overlay = createElement("div");
    overlay.dataset[PROCESSING_OVERLAY_DATA_KEY] = "true";
    overlay.textContent = "Processing...";
    if (overlay.style && typeof overlay.style === "object") {
      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        pointerEvents: "none",
        borderRadius: "inherit",
        background: "rgba(17, 17, 17, 0.16)",
        backdropFilter: "blur(2px)",
        color: "rgba(255, 255, 255, 0.92)",
        fontSize: "13px",
        fontWeight: "500",
        letterSpacing: "0.02em",
        opacity: "1",
        transition: `opacity ${PROCESSING_OVERLAY_FADE_MS}ms ease`
      });
    }
    return overlay;
  }
  function buildProcessingFilter(previousFilter = "") {
    const tokens = [previousFilter.trim(), "blur(4px)", "brightness(0.78)"].filter(Boolean);
    return tokens.join(" ");
  }
  function showProcessingOverlay(imageElement, {
    container = getPreferredGeminiImageContainer(imageElement) || imageElement?.parentElement || null,
    createElement = (tagName) => document.createElement(tagName),
    clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis) || null
  } = {}) {
    if (!imageElement || !container || typeof container.appendChild !== "function") {
      return null;
    }
    const existingState = processingOverlayState.get(imageElement);
    if (existingState) {
      if (existingState.hideTimerId !== null && typeof clearTimeoutImpl === "function") {
        clearTimeoutImpl(existingState.hideTimerId);
        existingState.hideTimerId = null;
        existingState.hideSequence += 1;
      }
      if (existingState.overlay?.style && typeof existingState.overlay.style === "object") {
        existingState.overlay.style.opacity = "1";
      }
      return existingState.overlay;
    }
    const overlay = createProcessingOverlayElement(createElement);
    const previousFilter = typeof imageElement?.style?.filter === "string" ? imageElement.style.filter : "";
    const previousContainerPosition = typeof container?.style?.position === "string" ? container.style.position : "";
    const didOverrideContainerPosition = Boolean(
      container.style && (!container.style.position || container.style.position === "static")
    );
    if (didOverrideContainerPosition) {
      container.style.position = "relative";
    }
    container.appendChild(overlay);
    if (imageElement.style && typeof imageElement.style === "object") {
      imageElement.style.filter = buildProcessingFilter(previousFilter);
    }
    if (imageElement.dataset) {
      imageElement.dataset[PROCESSING_VISUAL_DATA_KEY] = "true";
    }
    processingOverlayState.set(imageElement, {
      overlay,
      container,
      previousFilter,
      previousContainerPosition,
      didOverrideContainerPosition,
      hideTimerId: null,
      hideSequence: 0
    });
    return overlay;
  }
  function hideProcessingOverlay(imageElement, {
    removeImmediately = false,
    setTimeoutImpl = globalThis.setTimeout?.bind(globalThis) || null,
    clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis) || null
  } = {}) {
    const state = processingOverlayState.get(imageElement);
    if (!state) return;
    const nextHideSequence = state.hideSequence + 1;
    state.hideSequence = nextHideSequence;
    const cleanup = () => {
      if (processingOverlayState.get(imageElement) !== state) {
        return;
      }
      if (state.hideSequence !== nextHideSequence) {
        return;
      }
      if (state.overlay?.parentNode && typeof state.overlay.parentNode.removeChild === "function") {
        state.overlay.parentNode.removeChild(state.overlay);
      }
      if (imageElement?.style && typeof imageElement.style === "object") {
        imageElement.style.filter = state.previousFilter;
      }
      if (imageElement?.dataset) {
        delete imageElement.dataset[PROCESSING_VISUAL_DATA_KEY];
      }
      if (state.didOverrideContainerPosition && state.container?.style && typeof state.container.style === "object" && state.container.style.position === "relative") {
        state.container.style.position = state.previousContainerPosition;
      }
      state.hideTimerId = null;
      processingOverlayState.delete(imageElement);
    };
    if (removeImmediately || typeof setTimeoutImpl !== "function") {
      if (state.hideTimerId !== null && typeof clearTimeoutImpl === "function") {
        clearTimeoutImpl(state.hideTimerId);
        state.hideTimerId = null;
      }
      cleanup();
      return;
    }
    if (state.hideTimerId !== null && typeof clearTimeoutImpl === "function") {
      clearTimeoutImpl(state.hideTimerId);
    }
    if (state.overlay?.style && typeof state.overlay.style === "object") {
      state.overlay.style.opacity = "0";
    }
    state.hideTimerId = setTimeoutImpl(cleanup, PROCESSING_OVERLAY_FADE_MS);
  }
  function revokeTrackedObjectUrl(imageElement) {
    const previewState = previewOverlayState.get(imageElement);
    if (previewState?.overlay?.parentNode && typeof previewState.overlay.parentNode.removeChild === "function") {
      previewState.overlay.parentNode.removeChild(previewState.overlay);
    }
    if (previewState?.overlay?.style && typeof previewState.overlay.style === "object") {
      previewState.overlay.style.opacity = "0";
    }
    previewOverlayState.delete(imageElement);
    const objectUrl = imageElement?.dataset?.[PAGE_IMAGE_OBJECT_URL_KEY];
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    delete imageElement.dataset[PAGE_IMAGE_OBJECT_URL_KEY];
  }
  function resolveImageOverlayBox(imageElement, container) {
    const imageRect = normalizeCaptureRect(imageElement?.getBoundingClientRect?.());
    const containerRect = normalizeCaptureRect(container?.getBoundingClientRect?.());
    if (!imageRect || !containerRect) {
      return null;
    }
    const left = imageRect.left - containerRect.left;
    const top = imageRect.top - containerRect.top;
    if (![left, top].every(Number.isFinite)) {
      return null;
    }
    if (imageRect.width <= 0 || imageRect.height <= 0) {
      return null;
    }
    return {
      left,
      top,
      width: imageRect.width,
      height: imageRect.height
    };
  }
  function findContainerChildForDescendant(container, descendant) {
    let current = descendant;
    const getParent = (node) => node?.parentElement || node?.parentNode || null;
    while (getParent(current) && getParent(current) !== container) {
      current = getParent(current);
    }
    if (getParent(current) === container) {
      return current;
    }
    return null;
  }
  function resolvePreviewOverlayMount(imageElement) {
    const container = getPreferredGeminiImageContainer(imageElement) || imageElement?.parentElement || null;
    if (!container) {
      return {
        container: null,
        referenceNode: null
      };
    }
    const controls = typeof container.querySelector === "function" ? container.querySelector(".generated-image-controls") : null;
    const controlsParent = controls?.parentElement || controls?.parentNode || null;
    if (controlsParent && typeof controlsParent.appendChild === "function") {
      return {
        container: controlsParent,
        referenceNode: controls
      };
    }
    return {
      container,
      referenceNode: findContainerChildForDescendant(container, controls)
    };
  }
  function applySkippedImageState(imageElement) {
    imageElement.dataset[PAGE_IMAGE_STATE_KEY] = "skipped";
    hideProcessingOverlay(imageElement, { removeImmediately: true });
  }
  function applyReadyImageState(imageElement, processedBlob, {
    imageSessionStore = getDefaultImageSessionStore(),
    processedMeta = null,
    processedFrom = "",
    processedSlot = "preview"
  } = {}) {
    const objectUrl = URL.createObjectURL(processedBlob);
    revokeTrackedObjectUrl(imageElement);
    imageElement.dataset[PAGE_IMAGE_OBJECT_URL_KEY] = objectUrl;
    imageElement.dataset[PAGE_IMAGE_STATE_KEY] = "ready";
    const assetIds = readAssetIdsFromImageDataset(imageElement) || extractGeminiImageAssetIds(imageElement);
    const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
    if (sessionKey) {
      imageSessionStore.attachElement?.(
        sessionKey,
        resolveImageSessionSurfaceType(imageElement),
        imageElement
      );
      imageSessionStore.updateProcessedResult?.(sessionKey, {
        slot: processedSlot,
        objectUrl,
        blob: processedBlob || null,
        blobType: processedBlob?.type || "",
        processedMeta,
        processedFrom
      });
      imageSessionStore.markProcessing?.(
        sessionKey,
        resolveImageSessionSurfaceType(imageElement),
        "ready"
      );
    }
    const { container, referenceNode } = resolvePreviewOverlayMount(imageElement);
    if (container && typeof container.appendChild === "function") {
      const overlay = document.createElement("div");
      overlay.dataset[PREVIEW_OVERLAY_DATA_KEY] = "true";
      const overlayBox = resolveImageOverlayBox(imageElement, container);
      if (overlay.style && typeof overlay.style === "object") {
        Object.assign(overlay.style, {
          position: "absolute",
          inset: overlayBox ? "auto" : "0",
          left: overlayBox ? `${overlayBox.left}px` : "0",
          top: overlayBox ? `${overlayBox.top}px` : "0",
          width: overlayBox ? `${overlayBox.width}px` : "100%",
          height: overlayBox ? `${overlayBox.height}px` : "100%",
          pointerEvents: "none",
          backgroundImage: `url("${objectUrl}")`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain"
        });
      }
      if (container.style && typeof container.style === "object" && (!container.style.position || container.style.position === "static")) {
        container.style.position = "relative";
      }
      if (referenceNode && typeof container.insertBefore === "function") {
        container.insertBefore(overlay, referenceNode);
      } else {
        container.appendChild(overlay);
      }
      previewOverlayState.set(imageElement, {
        overlay
      });
    }
    hideProcessingOverlay(imageElement);
  }
  function applyFailedImageState(imageElement) {
    imageElement.dataset[PAGE_IMAGE_STATE_KEY] = "failed";
    hideProcessingOverlay(imageElement, { removeImmediately: true });
  }
  function preparePageImageProcessing(imageElement, {
    processing = null,
    HTMLImageElementClass = globalThis.HTMLImageElement,
    isProcessableImage = isProcessableGeminiImageElement,
    resolveSourceUrl = resolveCandidateImageUrl,
    resolveAssetIds = extractGeminiImageAssetIds,
    imageSessionStore = getDefaultImageSessionStore(),
    hideProcessingOverlayImpl = hideProcessingOverlay,
    revokeTrackedObjectUrlImpl = revokeTrackedObjectUrl,
    showProcessingOverlayImpl = showProcessingOverlay
  } = {}) {
    const isHtmlImageElement = typeof HTMLImageElementClass === "function" && imageElement instanceof HTMLImageElementClass;
    const isImageLikeElement = typeof imageElement?.tagName === "string" && imageElement.tagName.toUpperCase() === "IMG";
    if (!isHtmlImageElement && !isImageLikeElement) {
      return null;
    }
    if (typeof isProcessableImage === "function" && !isProcessableImage(imageElement)) {
      return null;
    }
    let sourceUrl = typeof resolveSourceUrl === "function" ? String(resolveSourceUrl(imageElement) || "").trim() : "";
    const dataset = imageElement.dataset || (imageElement.dataset = {});
    const assetIds = typeof resolveAssetIds === "function" ? resolveAssetIds(imageElement) : null;
    const rememberedSourceUrl = resolveRememberedOriginalAssetUrl(assetIds);
    const rememberedPreviewSourceUrl = isBlobPageImageSource(sourceUrl) || isDataPageImageSource(sourceUrl) ? resolveRememberedPreviewSourceUrl(assetIds, { imageSessionStore }) : "";
    const rememberedBoundSourceUrl = rememberedSourceUrl || rememberedPreviewSourceUrl;
    if (rememberedBoundSourceUrl && (!dataset.gwrSourceUrl || isBlobPageImageSource(sourceUrl) || isDataPageImageSource(sourceUrl))) {
      dataset.gwrSourceUrl = rememberedBoundSourceUrl;
      sourceUrl = rememberedBoundSourceUrl;
    }
    if (!sourceUrl) {
      return null;
    }
    const lastSourceUrl = dataset[PAGE_IMAGE_SOURCE_KEY] || "";
    const lastState = dataset[PAGE_IMAGE_STATE_KEY] || "";
    if (lastSourceUrl === sourceUrl && lastState === "ready") {
      return null;
    }
    if (typeof processing?.has === "function" && processing.has(imageElement)) {
      return null;
    }
    if (lastSourceUrl && lastSourceUrl !== sourceUrl) {
      hideProcessingOverlayImpl(imageElement, { removeImmediately: true });
      revokeTrackedObjectUrlImpl(imageElement);
    }
    if (typeof processing?.add === "function") {
      processing.add(imageElement);
    }
    const surfaceType = resolveImageSessionSurfaceType(imageElement);
    const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
    const isPreviewSource = shouldTreatPageImageSourceAsPreview(imageElement, sourceUrl);
    if (sessionKey) {
      imageSessionStore.attachElement?.(sessionKey, surfaceType, imageElement);
      if (isPreviewSource) {
        const existingPreviewResource = imageSessionStore.getBestResource?.(sessionKey, "display") || null;
        if (existingPreviewResource?.kind === "processed" && existingPreviewResource.slot === "preview" && existingPreviewResource.source === "request-preview") {
          return null;
        }
      }
      imageSessionStore.updateSourceSnapshot?.(sessionKey, {
        sourceUrl,
        isPreviewSource
      });
      imageSessionStore.markProcessing?.(sessionKey, surfaceType, "processing");
    }
    dataset.gwrStableSource = sourceUrl;
    dataset[PAGE_IMAGE_SOURCE_KEY] = sourceUrl;
    dataset[PAGE_IMAGE_STATE_KEY] = "processing";
    if (assetIds?.responseId) {
      dataset[PAGE_IMAGE_RESPONSE_ID_KEY] = assetIds.responseId;
    } else {
      delete dataset[PAGE_IMAGE_RESPONSE_ID_KEY];
    }
    if (assetIds?.draftId) {
      dataset[PAGE_IMAGE_DRAFT_ID_KEY] = assetIds.draftId;
    } else {
      delete dataset[PAGE_IMAGE_DRAFT_ID_KEY];
    }
    if (assetIds?.conversationId) {
      dataset[PAGE_IMAGE_CONVERSATION_ID_KEY] = assetIds.conversationId;
    } else {
      delete dataset[PAGE_IMAGE_CONVERSATION_ID_KEY];
    }
    showProcessingOverlayImpl(imageElement);
    return {
      sessionKey,
      surfaceType,
      sourceUrl,
      normalizedUrl: normalizeGoogleusercontentImageUrl(sourceUrl),
      isPreviewSource,
      assetIds: {
        responseId: assetIds?.responseId || null,
        draftId: assetIds?.draftId || null,
        conversationId: assetIds?.conversationId || null
      }
    };
  }
  function emitPageImageProcessingStart({
    logger = console,
    onLog = null,
    sourceUrl,
    normalizedUrl,
    isPreviewSource = false
  } = {}) {
    emitPageImageProcessEvent({
      logger,
      onLog,
      consoleMessage: "[Gemini Watermark Remover] page image process start",
      eventType: "page-image-process-start",
      payload: {
        sourceUrl,
        normalizedUrl
      }
    });
    if (!isPreviewSource) {
      return;
    }
    emitPageImageProcessEvent({
      logger,
      onLog,
      consoleMessage: "[Gemini Watermark Remover] page image process strategy",
      eventType: "page-image-process-strategy",
      payload: {
        sourceUrl,
        strategy: "preview-candidate-fallback"
      }
    });
  }
  function applyPageImageProcessingResult({
    imageElement,
    sourceUrl,
    normalizedUrl,
    isPreviewSource = false,
    sourceResult,
    imageSessionStore = getDefaultImageSessionStore(),
    logger = console,
    onLog = null
  } = {}) {
    if (sourceResult?.skipped) {
      applySkippedImageState(imageElement);
      const assetIds = readAssetIdsFromImageDataset(imageElement) || extractGeminiImageAssetIds(imageElement);
      const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
      if (sessionKey) {
        imageSessionStore.markProcessing?.(
          sessionKey,
          resolveImageSessionSurfaceType(imageElement),
          "idle"
        );
      }
      emitPageImageProcessEvent({
        logger,
        onLog,
        consoleMessage: "[Gemini Watermark Remover] page image process skipped",
        eventType: "page-image-process-skipped",
        payload: {
          sourceUrl,
          normalizedUrl,
          reason: sourceResult.reason || "preview-fetch-unavailable",
          candidateDiagnostics: sourceResult.candidateDiagnostics,
          candidateDiagnosticsSummary: sourceResult.candidateDiagnosticsSummary || ""
        }
      });
      return;
    }
    const processedBlob = sourceResult?.processedBlob;
    const selectedStrategy = sourceResult?.selectedStrategy || "";
    const candidateDiagnostics = sourceResult?.candidateDiagnostics || null;
    const candidateDiagnosticsSummary = sourceResult?.candidateDiagnosticsSummary || "";
    const captureTiming = sourceResult?.captureTiming || null;
    applyReadyImageState(imageElement, processedBlob, {
      imageSessionStore,
      processedMeta: sourceResult?.processedMeta || null,
      processedFrom: selectedStrategy || (isPreviewSource ? "preview-candidate" : "default"),
      processedSlot: isPreviewSource ? "preview" : "full"
    });
    emitPageImageProcessEvent({
      logger,
      onLog,
      consoleMessage: "[Gemini Watermark Remover] page image process success",
      eventType: "page-image-process-success",
      payload: {
        sourceUrl,
        normalizedUrl,
        strategy: selectedStrategy || (isPreviewSource ? "preview-candidate" : "default"),
        candidateDiagnostics,
        candidateDiagnosticsSummary,
        captureTiming,
        selectionDebug: sourceResult?.processedMeta?.selectionDebug ?? null,
        blobType: processedBlob?.type || "",
        blobSize: processedBlob?.size || 0
      }
    });
  }
  function handlePageImageProcessingFailure({
    imageElement,
    sourceUrl,
    normalizedUrl,
    error,
    imageSessionStore = getDefaultImageSessionStore(),
    logger = console,
    onLog = null
  } = {}) {
    const assetIds = readAssetIdsFromImageDataset(imageElement) || extractGeminiImageAssetIds(imageElement);
    const sessionKey = imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || "";
    if (sessionKey) {
      imageSessionStore.markProcessing?.(
        sessionKey,
        resolveImageSessionSurfaceType(imageElement),
        "failed",
        normalizeErrorMessage(error)
      );
    }
    emitPageImageProcessEvent({
      logger,
      onLog,
      level: "warn",
      consoleMessage: "[Gemini Watermark Remover] page image process failed",
      eventType: "page-image-process-failed",
      payload: {
        sourceUrl,
        normalizedUrl,
        error: normalizeErrorMessage(error),
        candidateDiagnostics: getErrorCandidateDiagnostics(error),
        candidateDiagnosticsSummary: getErrorCandidateDiagnosticsSummary(error)
      }
    });
    applyFailedImageState(imageElement);
  }
  function assetIdsMatch(candidate = null, target = null) {
    if (!candidate || !target) return false;
    if (candidate.draftId && target.draftId) {
      return candidate.draftId === target.draftId;
    }
    return Boolean(
      candidate.responseId && target.responseId && candidate.responseId === target.responseId && candidate.conversationId && target.conversationId && candidate.conversationId === target.conversationId
    );
  }
  function collectBindableImages(root) {
    return collectCandidateImages(root);
  }
  function bindOriginalAssetUrlToImages({
    root = document,
    assetIds = null,
    sourceUrl = "",
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
    if (!assetIds || !normalizedSourceUrl) {
      return 0;
    }
    rememberOriginalAssetUrlBinding(assetIds, normalizedSourceUrl, {
      imageSessionStore
    });
    if (!root) {
      return 0;
    }
    let updatedCount = 0;
    for (const imageElement of collectBindableImages(root)) {
      const imageAssetIds = {
        responseId: imageElement?.dataset?.[PAGE_IMAGE_RESPONSE_ID_KEY] || null,
        draftId: imageElement?.dataset?.[PAGE_IMAGE_DRAFT_ID_KEY] || null,
        conversationId: imageElement?.dataset?.[PAGE_IMAGE_CONVERSATION_ID_KEY] || null
      };
      const resolvedImageAssetIds = imageAssetIds.responseId || imageAssetIds.draftId || imageAssetIds.conversationId ? imageAssetIds : extractGeminiImageAssetIds(imageElement);
      if (!assetIdsMatch(resolvedImageAssetIds, assetIds)) {
        continue;
      }
      const dataset = imageElement.dataset || (imageElement.dataset = {});
      if (dataset.gwrSourceUrl === normalizedSourceUrl) {
        const rememberedPreviewResult2 = resolveRememberedProcessedPreviewResult(normalizedSourceUrl, {
          imageSessionStore
        });
        if (rememberedPreviewResult2) {
          applyReadyImageState(imageElement, rememberedPreviewResult2.processedBlob, {
            imageSessionStore,
            processedMeta: rememberedPreviewResult2.processedMeta,
            processedFrom: rememberedPreviewResult2.processedFrom,
            processedSlot: "preview"
          });
        }
        continue;
      }
      dataset.gwrSourceUrl = normalizedSourceUrl;
      const rememberedPreviewResult = resolveRememberedProcessedPreviewResult(normalizedSourceUrl, {
        imageSessionStore
      });
      if (rememberedPreviewResult) {
        applyReadyImageState(imageElement, rememberedPreviewResult.processedBlob, {
          imageSessionStore,
          processedMeta: rememberedPreviewResult.processedMeta,
          processedFrom: rememberedPreviewResult.processedFrom,
          processedSlot: "preview"
        });
      }
      updatedCount += 1;
    }
    return updatedCount;
  }
  function bindProcessedPreviewResultToImages({
    root = document,
    sourceUrl = "",
    processedBlob = null,
    processedMeta = null,
    processedFrom = "request-preview",
    sessionKey = "",
    assetIds = null,
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const normalizedSourceUrl = typeof sourceUrl === "string" ? normalizeGoogleusercontentImageUrl(sourceUrl.trim()) : "";
    if (!root || !normalizedSourceUrl || !(processedBlob instanceof Blob)) {
      return 0;
    }
    let updatedCount = 0;
    let rememberedSessionKey = typeof sessionKey === "string" ? sessionKey.trim() : "";
    for (const imageElement of collectBindableImages(root)) {
      const candidateSourceUrl = normalizeGoogleusercontentImageUrl(resolveCandidateImageUrl(imageElement) || "");
      if (candidateSourceUrl !== normalizedSourceUrl) {
        continue;
      }
      const dataset = imageElement.dataset || (imageElement.dataset = {});
      dataset.gwrSourceUrl ||= normalizedSourceUrl;
      applyReadyImageState(imageElement, processedBlob, {
        imageSessionStore,
        processedMeta,
        processedFrom,
        processedSlot: "preview"
      });
      if (!rememberedSessionKey) {
        const rememberedAssetIds = readAssetIdsFromImageDataset(imageElement) || extractGeminiImageAssetIds(imageElement);
        rememberedSessionKey = imageSessionStore.getOrCreateByAssetIds?.(rememberedAssetIds) || "";
      }
      updatedCount += 1;
    }
    rememberProcessedPreviewResult(normalizedSourceUrl, {
      sessionKey: rememberedSessionKey,
      assetIds,
      processedMeta,
      processedFrom
    }, {
      imageSessionStore
    });
    return updatedCount;
  }
  function buildPageImageSourceRequest({
    sourceUrl,
    assetIds = null,
    imageElement,
    fetchPreviewBlob,
    processWatermarkBlobImpl,
    removeWatermarkFromBlobImpl
  } = {}) {
    return {
      sourceUrl,
      assetIds,
      imageElement,
      fetchPreviewBlob,
      processWatermarkBlobImpl,
      removeWatermarkFromBlobImpl,
      captureRenderedImageBlob: imageElementToBlob,
      fetchBlobDirectImpl: fetchBlobDirect,
      validateBlob: loadImageFromBlob,
      fetchBlobFromBackgroundImpl: fetchBlobFromBackground
    };
  }
  function createPageImageReplacementController({
    logger = console,
    onLog = null,
    targetDocument = globalThis.document,
    imageSessionStore = getDefaultImageSessionStore(),
    fetchPreviewBlob = fetchBlobViaPageBridge,
    processPageImageSourceImpl = processPageImageSource,
    processWatermarkBlobImpl = processWatermarkBlob,
    removeWatermarkFromBlobImpl = removeWatermarkFromBlob,
    scheduleProcessingDrain = scheduleOnIdle,
    setTimeoutImpl = globalThis.setTimeout?.bind(globalThis) || null,
    clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis) || null
  } = {}) {
    const processing = /* @__PURE__ */ new WeakSet();
    const queued = /* @__PURE__ */ new WeakSet();
    const waitingForRenderable = /* @__PURE__ */ new WeakMap();
    const pendingImages = [];
    let observer = null;
    let drainScheduled = false;
    let drainActive = false;
    let recentImageSourceHint = null;
    function tryApplyRememberedPreviewResult(imageElement) {
      if (!imageElement || typeof imageElement !== "object") {
        return false;
      }
      const currentSourceUrl = String(resolveCandidateImageUrl(imageElement) || "").trim();
      const datasetSourceUrl = typeof imageElement?.dataset?.gwrSourceUrl === "string" ? imageElement.dataset.gwrSourceUrl.trim() : "";
      const stableSourceUrl = typeof imageElement?.dataset?.gwrStableSource === "string" ? imageElement.dataset.gwrStableSource.trim() : "";
      const candidateUrls = [datasetSourceUrl, stableSourceUrl, currentSourceUrl].filter(Boolean);
      for (const candidateUrl of candidateUrls) {
        const rememberedPreviewResult = resolveRememberedProcessedPreviewResult(candidateUrl, {
          imageSessionStore
        });
        if (!rememberedPreviewResult) {
          continue;
        }
        const dataset = imageElement.dataset || (imageElement.dataset = {});
        dataset.gwrSourceUrl ||= rememberedPreviewResult.sourceUrl;
        applyReadyImageState(imageElement, rememberedPreviewResult.processedBlob, {
          imageSessionStore,
          processedMeta: rememberedPreviewResult.processedMeta,
          processedFrom: rememberedPreviewResult.processedFrom,
          processedSlot: "preview"
        });
        return true;
      }
      return false;
    }
    function cleanupRenderableWait(imageElement) {
      const state = waitingForRenderable.get(imageElement);
      if (!state) return;
      if (typeof imageElement?.removeEventListener === "function") {
        imageElement.removeEventListener("load", state.handleReady);
        imageElement.removeEventListener("error", state.handleStop);
      }
      if (state.timeoutId !== null && typeof clearTimeoutImpl === "function") {
        clearTimeoutImpl(state.timeoutId);
      }
      waitingForRenderable.delete(imageElement);
    }
    function deferUntilRenderable(imageElement) {
      if (!imageElement || waitingForRenderable.has(imageElement)) return;
      const retry = () => {
        cleanupRenderableWait(imageElement);
        enqueueImage(imageElement);
      };
      const stopWaiting = () => {
        cleanupRenderableWait(imageElement);
      };
      const timeoutId = typeof setTimeoutImpl === "function" ? setTimeoutImpl(retry, PREVIEW_IMAGE_RENDER_RETRY_MS) : null;
      waitingForRenderable.set(imageElement, {
        handleReady: retry,
        handleStop: stopWaiting,
        timeoutId
      });
      if (typeof imageElement?.addEventListener === "function") {
        imageElement.addEventListener("load", retry, { once: true });
        imageElement.addEventListener("error", stopWaiting, { once: true });
      }
    }
    async function processImage(imageElement) {
      applyRecentImageSourceHintToImage(imageElement, recentImageSourceHint);
      if (tryApplyRememberedPreviewResult(imageElement)) {
        return;
      }
      const currentSourceUrl = String(resolveCandidateImageUrl(imageElement) || "").trim();
      if (currentSourceUrl && isBlobPageImageSource(currentSourceUrl) && !isPreviewImageRenderable(imageElement)) {
        deferUntilRenderable(imageElement);
        return;
      }
      cleanupRenderableWait(imageElement);
      const context = preparePageImageProcessing(imageElement, {
        processing,
        imageSessionStore
      });
      if (!context) return;
      const { sourceUrl, normalizedUrl, isPreviewSource, assetIds } = context;
      emitPageImageProcessingStart({
        logger,
        onLog,
        sourceUrl,
        normalizedUrl,
        isPreviewSource
      });
      try {
        const sourceResult = await processPageImageSourceImpl(buildPageImageSourceRequest({
          sourceUrl,
          assetIds,
          imageElement,
          fetchPreviewBlob,
          processWatermarkBlobImpl,
          removeWatermarkFromBlobImpl
        }));
        applyPageImageProcessingResult({
          imageElement,
          imageSessionStore,
          logger,
          onLog,
          sourceUrl,
          normalizedUrl,
          isPreviewSource,
          sourceResult
        });
      } catch (error) {
        handlePageImageProcessingFailure({
          imageElement,
          imageSessionStore,
          logger,
          onLog,
          sourceUrl,
          normalizedUrl,
          error
        });
      } finally {
        processing.delete(imageElement);
      }
    }
    async function drainQueue() {
      if (drainActive) return;
      drainActive = true;
      try {
        const imageElement = pendingImages.shift();
        if (!imageElement) return;
        queued.delete(imageElement);
        await processImage(imageElement);
      } finally {
        drainActive = false;
        if (pendingImages.length > 0) {
          scheduleDrain();
        }
      }
    }
    function scheduleDrain() {
      if (drainScheduled || drainActive) return;
      drainScheduled = true;
      scheduleProcessingDrain(() => {
        drainScheduled = false;
        void drainQueue();
      });
    }
    function enqueueImage(imageElement) {
      if (!imageElement) return;
      if (queued.has(imageElement) || processing.has(imageElement)) return;
      queued.add(imageElement);
      if (resolveImageSessionSurfaceType(imageElement) === "fullscreen") {
        pendingImages.unshift(imageElement);
      } else {
        pendingImages.push(imageElement);
      }
      scheduleDrain();
    }
    function processRoot(root = document) {
      for (const imageElement of collectCandidateImages(root)) {
        enqueueImage(imageElement);
      }
    }
    const batchProcessor = createRootBatchProcessor({ processRoot });
    const scheduleProcess = batchProcessor.schedule;
    function handlePointerIntent(event) {
      const hintedImage = resolveHintSourceImageFromEventTarget(event?.target);
      const nextHint = buildRecentImageSourceHint(hintedImage);
      if (!nextHint) {
        return;
      }
      recentImageSourceHint = nextHint;
    }
    function observe() {
      const root = targetDocument?.body || targetDocument?.documentElement;
      if (!root || observer) return;
      observer = new MutationObserver((mutations) => {
        handlePageImageMutations(mutations, {
          scheduleProcess,
          HTMLImageElementClass: HTMLImageElement
        });
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES
      });
    }
    function install() {
      processRoot(targetDocument);
      targetDocument?.addEventListener?.("pointerdown", handlePointerIntent, true);
      targetDocument?.addEventListener?.("click", handlePointerIntent, true);
      if (targetDocument?.readyState === "loading") {
        targetDocument.addEventListener("DOMContentLoaded", () => {
          observe();
          scheduleProcess(targetDocument);
        }, { once: true });
        return;
      }
      observe();
    }
    function dispose() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      targetDocument?.removeEventListener?.("pointerdown", handlePointerIntent, true);
      targetDocument?.removeEventListener?.("click", handlePointerIntent, true);
    }
    return {
      install,
      dispose,
      processRoot
    };
  }
  function installPageImageReplacement(options = {}) {
    const controller = createPageImageReplacementController(options);
    controller.install();
    return controller;
  }

  // src/shared/imageSessionContext.js
  function mergeImageSessionAssetIds(...candidates) {
    const merged = {
      responseId: "",
      draftId: "",
      conversationId: ""
    };
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeImageSessionAssetIds(candidate);
      if (!normalizedCandidate) {
        continue;
      }
      merged.responseId ||= normalizedCandidate.responseId || "";
      merged.draftId ||= normalizedCandidate.draftId || "";
      merged.conversationId ||= normalizedCandidate.conversationId || "";
    }
    return normalizeImageSessionAssetIds(merged);
  }
  function resolveImageElementFromTarget(target) {
    const normalizedTagName = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
    return normalizedTagName === "IMG" ? target : null;
  }
  function resolveImageSessionContext({
    action = "display",
    actionContext = null,
    target = null,
    imageElement = null,
    resolveImageElement = null,
    resolveAssetIds = extractGeminiImageAssetIds,
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    const resolvedActionContext = resolveCompatibleActionContext(actionContext);
    let resolvedImageElement = imageElement || resolvedActionContext?.imageElement || resolveImageElementFromTarget(target) || null;
    if (!resolvedImageElement && typeof resolveImageElement === "function") {
      resolvedImageElement = resolveImageElement(resolvedActionContext) || null;
    }
    const extractedImageAssetIds = typeof resolveAssetIds === "function" && resolvedImageElement ? resolveAssetIds(resolvedImageElement) : null;
    const extractedTargetAssetIds = typeof resolveAssetIds === "function" && target ? resolveAssetIds(target) : null;
    const assetIds = mergeImageSessionAssetIds(
      resolvedActionContext?.assetIds,
      extractedImageAssetIds,
      extractedTargetAssetIds
    );
    const explicitSessionKey = typeof resolvedActionContext?.sessionKey === "string" ? resolvedActionContext.sessionKey.trim() : "";
    const sessionKey = explicitSessionKey || imageSessionStore?.getOrCreateByAssetIds?.(assetIds) || buildImageSessionKey(assetIds);
    const sessionSnapshot = sessionKey ? imageSessionStore?.getSnapshot?.(sessionKey) || null : null;
    const mergedAssetIds = mergeImageSessionAssetIds(
      assetIds,
      sessionSnapshot?.assetIds
    );
    const resource = sessionKey ? imageSessionStore?.getBestResource?.(sessionKey, action) || null : null;
    const preferredImageElement = sessionKey ? imageSessionStore?.getPreferredElement?.(sessionKey, action) || null : null;
    if (preferredImageElement) {
      resolvedImageElement = preferredImageElement;
    }
    return {
      action,
      sessionKey: sessionKey || "",
      assetIds: mergedAssetIds,
      imageElement: resolvedImageElement,
      resource
    };
  }

  // src/userscript/clipboardHook.js
  function isImageMimeType(type) {
    return typeof type === "string" && /^image\//i.test(type);
  }
  function isBlobUrl(url) {
    return typeof url === "string" && /^blob:/i.test(url);
  }
  function hasClipboardImageItems(items) {
    return Array.from(items || []).some((item) => Array.isArray(item?.types) && item.types.some(isImageMimeType));
  }
  async function getFirstClipboardImageBlob(items) {
    for (const item of Array.from(items || [])) {
      const types = Array.isArray(item?.types) ? item.types.filter(isImageMimeType) : [];
      for (const type of types) {
        if (typeof item?.getType !== "function") {
          continue;
        }
        const blob = await item.getType(type);
        if (blob instanceof Blob) {
          return blob;
        }
      }
    }
    return null;
  }
  function isGeminiClipboardActionContext(actionContext) {
    if (!actionContext || typeof actionContext !== "object") {
      return false;
    }
    if (actionContext.action === "clipboard") {
      return true;
    }
    if (typeof actionContext.sessionKey === "string" && actionContext.sessionKey.trim()) {
      return true;
    }
    const assetIds = actionContext.assetIds;
    return Boolean(
      assetIds && typeof assetIds === "object" && (assetIds.responseId || assetIds.draftId || assetIds.conversationId)
    );
  }
  async function notifyActionCriticalFailure(onActionCriticalFailure, payload) {
    if (typeof onActionCriticalFailure !== "function") {
      return;
    }
    try {
      await onActionCriticalFailure(payload);
    } catch {
    }
  }
  function canvasToBlob2(canvas, type = "image/png") {
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== "function") {
        reject(new Error("Canvas toBlob unavailable"));
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Canvas toBlob returned null"));
      }, type);
    });
  }
  async function createBlobFromObjectUrlImage(objectUrl, imageElement, targetWindow = globalThis) {
    const ImageClass = targetWindow?.Image || globalThis.Image;
    const documentRef = imageElement?.ownerDocument || targetWindow?.document || globalThis.document;
    if (typeof ImageClass !== "function" || !documentRef?.createElement) {
      throw new Error("Image decode fallback unavailable");
    }
    const image = new ImageClass();
    image.decoding = "async";
    image.src = objectUrl;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load processed object URL"));
      });
    }
    const width = Number(image.naturalWidth) || Number(image.width) || Number(imageElement?.naturalWidth) || Number(imageElement?.width) || 0;
    const height = Number(image.naturalHeight) || Number(image.height) || Number(imageElement?.naturalHeight) || Number(imageElement?.height) || 0;
    if (width <= 0 || height <= 0) {
      throw new Error("Processed object URL image has no renderable size");
    }
    const canvas = documentRef.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext?.("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("2D canvas context unavailable");
    }
    context.drawImage(image, 0, 0, width, height);
    return canvasToBlob2(canvas, "image/png");
  }
  async function buildClipboardReplacementItems(items, replacementBlob, ClipboardItemClass) {
    const replacementItems = [];
    let replacedAny = false;
    for (const item of Array.from(items || [])) {
      const types = Array.isArray(item?.types) ? item.types.filter(Boolean) : [];
      if (!types.some(isImageMimeType) || typeof ClipboardItemClass !== "function") {
        replacementItems.push(item);
        continue;
      }
      const replacementData = {};
      for (const type of types) {
        if (isImageMimeType(type)) {
          continue;
        }
        if (typeof item.getType === "function") {
          replacementData[type] = item.getType(type);
        }
      }
      replacementData[replacementBlob.type || "image/png"] = replacementBlob;
      replacementItems.push(new ClipboardItemClass(replacementData));
      replacedAny = true;
    }
    return replacedAny ? replacementItems : items;
  }
  async function processClipboardImageBlobFallback(items, {
    processClipboardImageBlob = null,
    actionContext = null
  } = {}) {
    if (typeof processClipboardImageBlob !== "function") {
      return null;
    }
    const sourceBlob = await getFirstClipboardImageBlob(items);
    if (!(sourceBlob instanceof Blob)) {
      return null;
    }
    const result = await processClipboardImageBlob(sourceBlob, {
      actionContext,
      items
    });
    if (result instanceof Blob) {
      return result;
    }
    return result?.processedBlob instanceof Blob ? result.processedBlob : null;
  }
  async function resolveProcessedClipboardBlob({
    actionContext = null,
    resolveImageElement,
    imageSessionStore = getDefaultImageSessionStore(),
    fetchBlobDirect: fetchBlobDirect2,
    resolveBlobViaImageElement,
    requireFullProcessedResource = false
  }) {
    const sessionContext = resolveImageSessionContext({
      action: "clipboard",
      actionContext,
      resolveImageElement,
      imageSessionStore
    });
    const imageElement = sessionContext?.imageElement || actionContext?.imageElement || null;
    const sessionBlob = sessionContext?.resource?.kind === "processed" && sessionContext.resource.blob instanceof Blob ? sessionContext.resource.blob : null;
    if (sessionBlob) {
      return sessionBlob;
    }
    const processedResource = sessionContext?.resource?.kind === "processed" ? sessionContext.resource : null;
    const processedImageElementObjectUrl = typeof imageElement?.dataset?.gwrWatermarkObjectUrl === "string" ? imageElement.dataset.gwrWatermarkObjectUrl.trim() : "";
    const canReuseProcessedImageElementFallback = Boolean(
      processedImageElementObjectUrl && (!requireFullProcessedResource || !sessionContext?.resource || sessionContext.resource.kind === "preview" || sessionContext.resource.kind === "blob")
    );
    if (requireFullProcessedResource && !processedResource && !canReuseProcessedImageElementFallback) {
      return null;
    }
    const resourceUrl = processedResource && typeof sessionContext.resource.url === "string" ? sessionContext.resource.url.trim() : "";
    const objectUrl = resourceUrl || (canReuseProcessedImageElementFallback ? processedImageElementObjectUrl : "");
    if (!objectUrl) {
      return null;
    }
    if (imageElement && isBlobUrl(objectUrl) && typeof resolveBlobViaImageElement === "function") {
      try {
        return await resolveBlobViaImageElement({
          objectUrl,
          imageElement
        });
      } catch (error) {
        if (!requireFullProcessedResource && typeof fetchBlobDirect2 === "function") {
          return fetchBlobDirect2(objectUrl);
        }
        throw error;
      }
    }
    if (typeof fetchBlobDirect2 !== "function") {
      return null;
    }
    return fetchBlobDirect2(objectUrl);
  }
  function installGeminiClipboardImageHook(targetWindow, {
    provideActionContext = null,
    getActionContext = () => null,
    resolveImageElement = null,
    imageSessionStore = getDefaultImageSessionStore(),
    onActionCriticalFailure = null,
    processClipboardImageBlob = null,
    fetchBlobDirect: fetchBlobDirect2 = async (url) => {
      const response = await fetch(url);
      return response.blob();
    },
    resolveBlobViaImageElement = ({ objectUrl, imageElement }) => createBlobFromObjectUrlImage(objectUrl, imageElement, targetWindow),
    logger = console
  } = {}) {
    const clipboard = targetWindow?.navigator?.clipboard;
    if (!clipboard || typeof clipboard.write !== "function") {
      return () => {
      };
    }
    const originalWrite = clipboard.write.bind(clipboard);
    const ClipboardItemClass = targetWindow?.ClipboardItem || globalThis.ClipboardItem;
    const resolveActionContextProvider = typeof provideActionContext === "function" ? provideActionContext : createActionContextProvider({ getActionContext });
    const hookedWrite = async function gwrClipboardWriteHook(items) {
      const actionContext = resolveActionContextProvider();
      const containsImageItems = hasClipboardImageItems(items);
      const requiresOriginalGeminiBlob = containsImageItems && isGeminiClipboardActionContext(actionContext);
      let clipboardResolutionError = null;
      try {
        if (!containsImageItems) {
          return originalWrite(items);
        }
        let processedBlob = null;
        try {
          processedBlob = await resolveProcessedClipboardBlob({
            actionContext,
            resolveImageElement,
            imageSessionStore,
            fetchBlobDirect: fetchBlobDirect2,
            resolveBlobViaImageElement,
            requireFullProcessedResource: requiresOriginalGeminiBlob
          });
        } catch (error) {
          clipboardResolutionError = error;
        }
        if (!processedBlob && requiresOriginalGeminiBlob && clipboardResolutionError) {
          processedBlob = await processClipboardImageBlobFallback(items, {
            processClipboardImageBlob,
            actionContext
          });
        }
        if (!processedBlob) {
          if (requiresOriginalGeminiBlob) {
            throw clipboardResolutionError || new Error("Original image is unavailable for clipboard processing");
          }
          return originalWrite(items);
        }
        const replacementItems = await buildClipboardReplacementItems(
          items,
          processedBlob,
          ClipboardItemClass
        );
        return originalWrite(replacementItems);
      } catch (error) {
        logger?.warn?.("[Gemini Watermark Remover] Clipboard image hook failed, falling back:", error);
        if (requiresOriginalGeminiBlob) {
          await notifyActionCriticalFailure(onActionCriticalFailure, {
            error,
            actionContext,
            items
          });
          throw error;
        }
        return originalWrite(items);
      }
    };
    clipboard.write = hookedWrite;
    return () => {
      if (clipboard.write === hookedWrite) {
        clipboard.write = originalWrite;
      }
    };
  }

  // src/userscript/actionContext.js
  function assetIdsMatch2(candidate = null, target = null) {
    if (!candidate || !target) {
      return false;
    }
    if (candidate.draftId && target.draftId) {
      return candidate.draftId === target.draftId;
    }
    return Boolean(
      candidate.responseId && target.responseId && candidate.responseId === target.responseId && candidate.conversationId && target.conversationId && candidate.conversationId === target.conversationId
    );
  }
  function findGeminiImageElementForAssetIds(root, assetIds) {
    if (!root || !assetIds || typeof root.querySelectorAll !== "function") {
      return null;
    }
    let fallbackMatch = null;
    for (const imageElement of root.querySelectorAll(getGeminiImageQuerySelector())) {
      if (!assetIdsMatch2(extractGeminiImageAssetIds(imageElement), assetIds)) {
        continue;
      }
      if (imageElement?.dataset?.gwrWatermarkObjectUrl) {
        return imageElement;
      }
      fallbackMatch ||= imageElement;
    }
    return fallbackMatch;
  }
  function findGeminiImageElementForSourceUrl(root, sourceUrl = "") {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }
    const normalizedTargetUrl = typeof sourceUrl === "string" ? normalizeGoogleusercontentImageUrl(sourceUrl.trim()) : "";
    if (!normalizedTargetUrl) {
      return null;
    }
    let fallbackMatch = null;
    const unboundBlobCandidates = [];
    for (const imageElement of root.querySelectorAll(getGeminiImageQuerySelector())) {
      const candidateUrl = normalizeGoogleusercontentImageUrl(resolveCandidateImageUrl(imageElement) || "");
      if (!candidateUrl || candidateUrl !== normalizedTargetUrl) {
        const currentSrc = typeof imageElement?.currentSrc === "string" ? imageElement.currentSrc.trim() : "";
        const src = typeof imageElement?.src === "string" ? imageElement.src.trim() : "";
        const hasExplicitSource = typeof imageElement?.dataset?.gwrSourceUrl === "string" && imageElement.dataset.gwrSourceUrl.trim();
        if (!hasExplicitSource && (currentSrc.startsWith("blob:") || src.startsWith("blob:"))) {
          unboundBlobCandidates.push(imageElement);
        }
        continue;
      }
      if (imageElement?.dataset?.gwrWatermarkObjectUrl) {
        return imageElement;
      }
      fallbackMatch ||= imageElement;
    }
    if (!fallbackMatch && unboundBlobCandidates.length === 1) {
      return unboundBlobCandidates[0];
    }
    return fallbackMatch;
  }
  function collectCandidateImagesFromRoot(root) {
    if (!root || typeof root !== "object") {
      return [];
    }
    const candidates = [];
    if (typeof root.tagName === "string" && root.tagName.toUpperCase() === "IMG") {
      candidates.push(root);
    }
    if (typeof root.querySelectorAll === "function") {
      candidates.push(...root.querySelectorAll("img"));
    }
    return candidates.filter(Boolean);
  }
  function findPreferredGeminiImageElement(root, assetIds) {
    const candidates = collectCandidateImagesFromRoot(root);
    if (candidates.length === 0) {
      return null;
    }
    const matchingAssetCandidate = assetIds ? candidates.find((imageElement) => assetIdsMatch2(extractGeminiImageAssetIds(imageElement), assetIds)) : null;
    const processedMatchingAssetCandidate = matchingAssetCandidate?.dataset?.gwrWatermarkObjectUrl ? matchingAssetCandidate : null;
    if (processedMatchingAssetCandidate) {
      return processedMatchingAssetCandidate;
    }
    if (matchingAssetCandidate) {
      return matchingAssetCandidate;
    }
    const processedProcessableCandidate = candidates.find((imageElement) => typeof imageElement?.dataset?.gwrWatermarkObjectUrl === "string" && imageElement.dataset.gwrWatermarkObjectUrl.trim());
    if (processedProcessableCandidate) {
      return processedProcessableCandidate;
    }
    return candidates[0] || null;
  }
  function findNearbyGeminiImageElement(targetWindow, target, assetIds) {
    const buttonLike = typeof target?.closest === "function" ? target.closest('button,[role="button"]') : null;
    const globalAssetMatch = assetIds ? findGeminiImageElementForAssetIds(targetWindow?.document || document, assetIds) : null;
    const candidateRoots = [
      buttonLike?.closest?.("generated-image,.generated-image-container"),
      buttonLike?.closest?.("single-image"),
      buttonLike?.closest?.('expansion-dialog,[role="dialog"],.image-expansion-dialog-panel,.cdk-overlay-pane'),
      buttonLike?.closest?.("[data-test-draft-id]")
    ].filter(Boolean);
    for (const root of candidateRoots) {
      const imageElement = findPreferredGeminiImageElement(root, assetIds);
      if (imageElement?.dataset?.gwrWatermarkObjectUrl) {
        return imageElement;
      }
      if (globalAssetMatch?.dataset?.gwrWatermarkObjectUrl) {
        return globalAssetMatch;
      }
      if (imageElement) {
        return imageElement;
      }
    }
    return globalAssetMatch;
  }
  function createGeminiActionContextResolver({
    targetWindow,
    imageSessionStore = getDefaultImageSessionStore()
  } = {}) {
    function resolveActionContext(target, {
      action = "display"
    } = {}) {
      const initialImageElement = findNearbyGeminiImageElement(targetWindow, target, null);
      const initialContext = resolveImageSessionContext({
        action,
        target,
        imageElement: initialImageElement,
        imageSessionStore
      });
      const preferredImageElement = initialContext?.assetIds ? findNearbyGeminiImageElement(targetWindow, target, initialContext.assetIds) : null;
      if (!preferredImageElement || preferredImageElement === initialImageElement) {
        return initialContext;
      }
      return resolveImageSessionContext({
        action,
        target,
        imageElement: preferredImageElement,
        imageSessionStore
      });
    }
    function resolveImageElement(actionContext = null) {
      if (actionContext?.imageElement) {
        return actionContext.imageElement;
      }
      const assetIds = actionContext?.assetIds || null;
      const target = actionContext?.target || null;
      return findNearbyGeminiImageElement(targetWindow, target, assetIds);
    }
    return {
      resolveActionContext,
      resolveImageElement
    };
  }

  // src/userscript/downloadHook.js
  function buildHookRequestArgs(args, normalizedUrl) {
    const nextArgs = [...args];
    const input = nextArgs[0];
    if (typeof input === "string") {
      nextArgs[0] = normalizedUrl;
      return nextArgs;
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      nextArgs[0] = new Request(normalizedUrl, input);
      return nextArgs;
    }
    nextArgs[0] = normalizedUrl;
    return nextArgs;
  }
  function hasHeaderValue(headersLike, headerName) {
    if (!headersLike) return false;
    const normalizedHeaderName = String(headerName || "").toLowerCase();
    if (typeof Headers !== "undefined" && headersLike instanceof Headers) {
      return headersLike.get(normalizedHeaderName) === "1";
    }
    if (Array.isArray(headersLike)) {
      return headersLike.some(([name, value]) => String(name || "").toLowerCase() === normalizedHeaderName && String(value || "") === "1");
    }
    if (typeof headersLike === "object") {
      for (const [name, value] of Object.entries(headersLike)) {
        if (String(name || "").toLowerCase() === normalizedHeaderName && String(value || "") === "1") {
          return true;
        }
      }
    }
    return false;
  }
  function shouldBypassHook(args) {
    const input = args[0];
    const init2 = args[1];
    if (init2?.gwrBypass === true) {
      return true;
    }
    if (input && typeof input === "object" && input.gwrBypass === true) {
      return true;
    }
    if (typeof Request !== "undefined" && input instanceof Request && input.headers?.get("x-gwr-bypass") === "1") {
      return true;
    }
    return hasHeaderValue(init2?.headers, "x-gwr-bypass");
  }
  function buildProcessedResponse(response, blob) {
    const headers = new Headers(response.headers);
    if (blob.type) {
      headers.set("content-type", blob.type);
    }
    return new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  function buildDirectBlobResponse(blob, mimeType = "") {
    const headers = new Headers();
    const resolvedMimeType = mimeType || blob?.type || "application/octet-stream";
    if (resolvedMimeType) {
      headers.set("content-type", resolvedMimeType);
    }
    return new Response(blob, {
      status: 200,
      statusText: "OK",
      headers
    });
  }
  function isImageResponse(response) {
    const contentType = response?.headers?.get?.("content-type") || "";
    if (!contentType) {
      return true;
    }
    return /^image\//i.test(contentType);
  }
  function serializeResponseHeaders(headers) {
    const entries = {};
    if (!headers || typeof headers.forEach !== "function") {
      return entries;
    }
    headers.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }
  function shouldReuseProcessedDownloadResource(actionContext) {
    return actionContext?.action === "download" && actionContext?.resource?.kind === "processed" && actionContext?.resource?.slot === "full" && actionContext.resource.blob instanceof Blob;
  }
  async function notifyActionCriticalFailure2(onActionCriticalFailure, payload) {
    if (typeof onActionCriticalFailure !== "function") {
      return;
    }
    try {
      await onActionCriticalFailure(payload);
    } catch {
    }
  }
  var DOWNLOAD_ACTION_LABEL_PATTERN = /(download|copy|下载|复制)/i;
  var COPY_ACTION_LABEL_PATTERN = /(copy|复制)/i;
  var EXPLICIT_DOWNLOAD_ACTION_LABEL_PATTERN = /(download|下载)/i;
  var INTENT_EVENT_TYPES = ["click", "keydown"];
  var DEFAULT_INTENT_WINDOW_MS = 5e3;
  var DEFAULT_DOWNLOAD_STICKY_WINDOW_MS = 3e4;
  var GEMINI_DOWNLOAD_RPC_HOST = "gemini.google.com";
  var GEMINI_DOWNLOAD_RPC_PATH = "/_/BardChatUi/data/batchexecute";
  var GEMINI_GOOGLEUSERCONTENT_URL_PATTERN = /https:(?:(?:\\\\\/)|(?:\\\/)|\/){2}[^\s"'\]]*googleusercontent\.com(?:(?:\\\\\/)|(?:\\\/)|\/)[^\s"'\]]+/gi;
  var GEMINI_RESPONSE_ID_PATTERN = /\br_[a-z0-9]+\b/i;
  var GEMINI_DRAFT_ID_PATTERN = /\brc_[a-z0-9]+\b/i;
  var GEMINI_CONVERSATION_ID_PATTERN = /\bc_[a-z0-9]+\b/i;
  var GEMINI_RESPONSE_BINDING_PATTERN = /(?<conversationId>c_[a-z0-9]+)[\s\S]{0,96}?(?<responseId>r_[a-z0-9]+)[\s\S]{0,96}?(?<draftId>rc_[a-z0-9]+)/gi;
  var GEMINI_DRAFT_URL_BLOCK_PATTERN = /(?<draftId>rc_[a-z0-9]+)(?:(?:\\\\")|")?,\[(?:(?:\\\\")|")http:\/\/googleusercontent\.com\/image_generation_content\/\d+(?:(?:\\\\")|")?\][\s\S]{0,2400}?(?<discoveredUrl>https:(?:(?:\\\\\/)|(?:\\\/)|\/){2}[^\s"'\]]*googleusercontent\.com(?:(?:\\\\\/)|(?:\\\/)|\/)[^\s"'\]]+)/gi;
  var GEMINI_XHR_HOOK_STATE = Symbol("gwrGeminiRpcXhrState");
  var GEMINI_XHR_HOOK_LISTENER = Symbol("gwrGeminiRpcXhrListener");
  function normalizeActionLabel(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function extractIntentCandidateUrl(candidate) {
    if (typeof candidate === "string") {
      return candidate.trim();
    }
    if (!candidate || typeof candidate !== "object") {
      return "";
    }
    if (typeof candidate.normalizedUrl === "string" && candidate.normalizedUrl.trim()) {
      return candidate.normalizedUrl.trim();
    }
    if (typeof candidate.url === "string" && candidate.url.trim()) {
      return candidate.url.trim();
    }
    return "";
  }
  function isGeminiDownloadAssetUrl(url) {
    return classifyGeminiAssetUrl(url)?.isDownload === true;
  }
  function collectButtonLikeLabels(element) {
    if (!element || typeof element !== "object") {
      return [];
    }
    const button = typeof element.closest === "function" ? element.closest('button,[role="button"]') : null;
    if (!button || typeof button !== "object") {
      return [];
    }
    return [
      button.getAttribute?.("aria-label") || "",
      button.getAttribute?.("title") || "",
      button.innerText || "",
      button.textContent || ""
    ].map(normalizeActionLabel).filter(Boolean);
  }
  function isGeminiDownloadActionTarget(target) {
    return collectButtonLikeLabels(target).some((label) => DOWNLOAD_ACTION_LABEL_PATTERN.test(label));
  }
  function resolveGeminiActionKind(target) {
    const labels = collectButtonLikeLabels(target);
    if (labels.some((label) => COPY_ACTION_LABEL_PATTERN.test(label))) {
      return "clipboard";
    }
    if (labels.some((label) => EXPLICIT_DOWNLOAD_ACTION_LABEL_PATTERN.test(label))) {
      return "download";
    }
    return "";
  }
  function createGeminiDownloadIntentGate({
    targetWindow = globalThis,
    now = () => Date.now(),
    windowMs = DEFAULT_INTENT_WINDOW_MS,
    downloadWindowMs = DEFAULT_DOWNLOAD_STICKY_WINDOW_MS,
    resolveActionContext = null
  } = {}) {
    let armedUntil = 0;
    let downloadStickyUntil = 0;
    let recentActionContext = null;
    let recentIntentTarget = null;
    function cloneActionContext(actionContext = null) {
      return actionContext && typeof actionContext === "object" ? { ...actionContext } : null;
    }
    function arm(actionContext = null, target = null) {
      armedUntil = Math.max(armedUntil, now() + windowMs);
      recentActionContext = cloneActionContext(actionContext);
      recentIntentTarget = target || recentIntentTarget || null;
      const resolvedActionKind = actionContext?.action || resolveGeminiActionKind(target) || "";
      if (resolvedActionKind === "download") {
        downloadStickyUntil = Math.max(
          downloadStickyUntil,
          now() + Math.max(windowMs, downloadWindowMs)
        );
        return;
      }
      downloadStickyUntil = 0;
    }
    function hasStickyDownloadIntent(candidate = null) {
      if (now() > downloadStickyUntil) {
        return false;
      }
      return isGeminiDownloadAssetUrl(extractIntentCandidateUrl(candidate));
    }
    function hasRecentIntent(candidate = null) {
      return now() <= armedUntil || hasStickyDownloadIntent(candidate);
    }
    function getRecentActionContext(candidate = null) {
      if (!hasRecentIntent(candidate)) {
        return null;
      }
      if (recentIntentTarget && typeof resolveActionContext === "function") {
        const refreshedActionContext = cloneActionContext(
          resolveActionContext(recentIntentTarget, null)
        );
        if (refreshedActionContext) {
          recentActionContext = refreshedActionContext;
          return refreshedActionContext;
        }
      }
      return recentActionContext;
    }
    function release(candidate = null) {
      if (candidate == null || isGeminiDownloadAssetUrl(extractIntentCandidateUrl(candidate))) {
        armedUntil = 0;
        downloadStickyUntil = 0;
        recentActionContext = null;
        recentIntentTarget = null;
      }
    }
    function handleEvent(event) {
      if (!event || typeof event !== "object") {
        return;
      }
      if (event.type === "keydown") {
        const key = typeof event.key === "string" ? event.key : "";
        if (key && key !== "Enter" && key !== " ") {
          return;
        }
      }
      if (isGeminiDownloadActionTarget(event.target)) {
        const actionContext = typeof resolveActionContext === "function" ? resolveActionContext(event.target, event) : null;
        arm(actionContext, event.target);
      }
    }
    for (const eventType of INTENT_EVENT_TYPES) {
      targetWindow?.addEventListener?.(eventType, handleEvent, true);
    }
    return {
      arm,
      hasRecentIntent,
      getRecentActionContext,
      release,
      handleEvent,
      dispose() {
        for (const eventType of INTENT_EVENT_TYPES) {
          targetWindow?.removeEventListener?.(eventType, handleEvent, true);
        }
      }
    };
  }
  function isGeminiBatchExecuteUrl(url) {
    if (typeof url !== "string" || url.length === 0) {
      return false;
    }
    try {
      const parsed = new URL(url);
      return parsed.hostname === GEMINI_DOWNLOAD_RPC_HOST && parsed.pathname === GEMINI_DOWNLOAD_RPC_PATH;
    } catch {
      return false;
    }
  }
  function decodeEscapedRpcUrl(rawUrl) {
    let decodedUrl = String(rawUrl || "").trim();
    if (!decodedUrl) {
      return "";
    }
    decodedUrl = decodedUrl.replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&").replace(/\\u002f/gi, "/").replace(/\\u003f/gi, "?").replace(/\\u003a/gi, ":");
    let previous = "";
    while (decodedUrl !== previous) {
      previous = decodedUrl;
      decodedUrl = decodedUrl.replace(/\\\\\//g, "/").replace(/\\\//g, "/");
    }
    return decodedUrl.replace(/[\\"]+$/g, "").trim();
  }
  function decodeRpcRequestBodyText(rawText) {
    let decodedText = String(rawText || "").trim();
    if (!decodedText) {
      return "";
    }
    let previous = "";
    let attempts = 0;
    while (decodedText !== previous && attempts < 3) {
      previous = decodedText;
      attempts += 1;
      try {
        decodedText = decodeURIComponent(decodedText.replace(/\+/g, "%20"));
      } catch {
        break;
      }
    }
    return decodedText;
  }
  function matchGeminiAssetIds(text) {
    if (typeof text !== "string" || text.length === 0) {
      return null;
    }
    const responseId = text.match(GEMINI_RESPONSE_ID_PATTERN)?.[0] || null;
    const draftId = text.match(GEMINI_DRAFT_ID_PATTERN)?.[0] || null;
    const conversationId = text.match(GEMINI_CONVERSATION_ID_PATTERN)?.[0] || null;
    if (!responseId && !draftId && !conversationId) {
      return null;
    }
    return {
      responseId,
      draftId,
      conversationId
    };
  }
  function extractGeminiAssetIdsFromRpcRequestBody(body) {
    const candidateTexts = [];
    if (typeof body === "string") {
      candidateTexts.push(body);
      try {
        const searchParams = new URLSearchParams(body);
        const requestPayload = searchParams.get("f.req");
        if (requestPayload) {
          candidateTexts.push(requestPayload);
        }
      } catch {
      }
    } else if (body instanceof URLSearchParams) {
      candidateTexts.push(body.toString());
      const requestPayload = body.get("f.req");
      if (requestPayload) {
        candidateTexts.push(requestPayload);
      }
    } else {
      return null;
    }
    for (const candidateText of candidateTexts) {
      const assetIds = matchGeminiAssetIds(candidateText) || matchGeminiAssetIds(decodeRpcRequestBodyText(candidateText));
      if (assetIds) {
        return assetIds;
      }
    }
    return null;
  }
  async function extractGeminiAssetIdsFromRpcRequestArgs(args) {
    const input = args[0];
    const init2 = args[1];
    const initBodyAssetIds = extractGeminiAssetIdsFromRpcRequestBody(init2?.body);
    if (initBodyAssetIds) {
      return initBodyAssetIds;
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const requestText = await input.clone().text();
        return extractGeminiAssetIdsFromRpcRequestBody(requestText);
      } catch {
        return null;
      }
    }
    return null;
  }
  function extractGeminiOriginalAssetUrlsFromResponseText(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const discoveredUrls = /* @__PURE__ */ new Set();
    for (const match of responseText.matchAll(GEMINI_GOOGLEUSERCONTENT_URL_PATTERN)) {
      const candidateUrl = decodeEscapedRpcUrl(match[0]);
      const normalizedUrl = normalizeGoogleusercontentImageUrl(candidateUrl);
      if (!isGeminiOriginalAssetUrl(normalizedUrl)) {
        continue;
      }
      discoveredUrls.add(normalizedUrl);
    }
    return Array.from(discoveredUrls);
  }
  function extractGeminiGeneratedAssetUrlsFromResponseText(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const discoveredUrls = /* @__PURE__ */ new Set();
    for (const match of responseText.matchAll(GEMINI_GOOGLEUSERCONTENT_URL_PATTERN)) {
      const candidateUrl = decodeEscapedRpcUrl(match[0]);
      const normalizedUrl = normalizeGoogleusercontentImageUrl(candidateUrl);
      if (!isGeminiGeneratedAssetUrl(normalizedUrl)) {
        continue;
      }
      discoveredUrls.add(normalizedUrl);
    }
    return Array.from(discoveredUrls);
  }
  function parseGeminiHistoryPayloadsFromResponseText(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const payloads = [];
    for (const line of responseText.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("[[")) {
        continue;
      }
      let parsedLine = null;
      try {
        parsedLine = JSON.parse(trimmedLine);
      } catch {
        continue;
      }
      if (!Array.isArray(parsedLine)) {
        continue;
      }
      for (const entry of parsedLine) {
        const rpcId = Array.isArray(entry) ? entry[1] : "";
        const innerPayloadText = Array.isArray(entry) ? entry[2] : "";
        if (rpcId !== "hNvQHb" || typeof innerPayloadText !== "string" || innerPayloadText.length === 0) {
          continue;
        }
        try {
          const innerPayload = JSON.parse(innerPayloadText);
          if (Array.isArray(innerPayload)) {
            payloads.push(innerPayload);
          }
        } catch {
        }
      }
    }
    return payloads;
  }
  function isGeminiResponseTuple(value) {
    return Array.isArray(value) && value.length >= 2 && typeof value[0] === "string" && value[0].startsWith("c_") && typeof value[1] === "string" && value[1].startsWith("r_");
  }
  function collectGeminiResponseSequence(node, sequence = [], seen = /* @__PURE__ */ new Map(), state = {
    order: 0
  }) {
    if (!Array.isArray(node)) {
      return sequence;
    }
    if (isGeminiResponseTuple(node)) {
      const conversationId = node[0];
      const responseId = node[1];
      const draftId = typeof node[2] === "string" && node[2].startsWith("rc_") ? node[2] : null;
      const responseKey = `${conversationId}|${responseId}`;
      const tupleOrder = state.order;
      state.order += 1;
      const existing = seen.get(responseKey);
      if (existing) {
        if (!existing.draftId && draftId) {
          existing.draftId = draftId;
          existing.firstDraftOrder = tupleOrder;
        }
        return sequence;
      }
      const entry = {
        conversationId,
        responseId,
        draftId,
        firstOrder: tupleOrder,
        firstDraftOrder: draftId ? tupleOrder : Number.POSITIVE_INFINITY
      };
      seen.set(responseKey, entry);
      sequence.push(entry);
      return sequence;
    }
    for (const item of node) {
      collectGeminiResponseSequence(item, sequence, seen, state);
    }
    return sequence;
  }
  function collectGeminiGeneratedUrlsFromParsedNode(node, urls = /* @__PURE__ */ new Set()) {
    if (typeof node === "string") {
      const normalizedUrl = normalizeGoogleusercontentImageUrl(decodeEscapedRpcUrl(node));
      if (isGeminiGeneratedAssetUrl(normalizedUrl)) {
        urls.add(normalizedUrl);
      }
      return urls;
    }
    if (!Array.isArray(node)) {
      if (node && typeof node === "object") {
        for (const value of Object.values(node)) {
          collectGeminiGeneratedUrlsFromParsedNode(value, urls);
        }
      }
      return urls;
    }
    for (const item of node) {
      collectGeminiGeneratedUrlsFromParsedNode(item, urls);
    }
    return urls;
  }
  function collectGeminiDraftBlocksFromParsedNode(node, blocks = []) {
    if (!Array.isArray(node)) {
      return blocks;
    }
    if (typeof node[0] === "string" && node[0].startsWith("rc_")) {
      const discoveredUrls = Array.from(collectGeminiGeneratedUrlsFromParsedNode(node));
      if (discoveredUrls.length > 0) {
        blocks.push({
          draftId: node[0],
          discoveredUrls
        });
      }
      return blocks;
    }
    for (const item of node) {
      collectGeminiDraftBlocksFromParsedNode(item, blocks);
    }
    return blocks;
  }
  function collectGeminiDraftIdsFromParsedNode(node, draftIds = []) {
    if (!Array.isArray(node)) {
      return draftIds;
    }
    if (typeof node[0] === "string" && node[0].startsWith("rc_")) {
      draftIds.push(node[0]);
    }
    for (const item of node) {
      collectGeminiDraftIdsFromParsedNode(item, draftIds);
    }
    return draftIds;
  }
  function extractGeminiAssetBindingsFromParsedHistorySegments(node, bindings = [], seen = /* @__PURE__ */ new Set()) {
    if (!Array.isArray(node)) {
      return bindings;
    }
    const immediateResponses = node.filter(isGeminiResponseTuple);
    const discoveredUrls = Array.from(collectGeminiGeneratedUrlsFromParsedNode(node));
    const draftIds = collectGeminiDraftIdsFromParsedNode(node);
    if (immediateResponses.length > 0 && discoveredUrls.length > 0 && draftIds.length > 0) {
      const leadingResponse = immediateResponses[0];
      const responseDraftId = typeof leadingResponse[2] === "string" && leadingResponse[2].startsWith("rc_") ? leadingResponse[2] : null;
      const resolvedDraftId = draftIds[draftIds.length - 1] || responseDraftId || null;
      const conversationId = leadingResponse[0];
      const responseId = leadingResponse[1];
      for (const discoveredUrl of discoveredUrls) {
        const bindingKey = `${conversationId || ""}|${responseId || ""}|${resolvedDraftId || ""}|${discoveredUrl}`;
        if (seen.has(bindingKey)) {
          continue;
        }
        seen.add(bindingKey);
        bindings.push({
          discoveredUrl,
          assetIds: {
            responseId,
            draftId: resolvedDraftId,
            conversationId
          }
        });
      }
      return bindings;
    }
    for (const child of node) {
      extractGeminiAssetBindingsFromParsedHistorySegments(child, bindings, seen);
    }
    return bindings;
  }
  function extractGeminiAssetBindingsFromParsedHistoryNode(historyNode) {
    if (!Array.isArray(historyNode)) {
      return [];
    }
    const responseSequence = collectGeminiResponseSequence(historyNode).slice().sort((left, right) => {
      const leftOrder = Number.isFinite(left.firstDraftOrder) ? left.firstDraftOrder : left.firstOrder;
      const rightOrder = Number.isFinite(right.firstDraftOrder) ? right.firstDraftOrder : right.firstOrder;
      return leftOrder - rightOrder;
    });
    const draftBlocks = collectGeminiDraftBlocksFromParsedNode(historyNode);
    if (responseSequence.length > 0 && draftBlocks.length > 0) {
      const remainingResponseEntries = [...responseSequence];
      const responseEntriesByDraftId = /* @__PURE__ */ new Map();
      for (const responseEntry of responseSequence) {
        if (!responseEntry.draftId) {
          continue;
        }
        const existingEntries = responseEntriesByDraftId.get(responseEntry.draftId);
        if (existingEntries) {
          existingEntries.push(responseEntry);
        } else {
          responseEntriesByDraftId.set(responseEntry.draftId, [responseEntry]);
        }
      }
      const bindings = [];
      for (const draftBlock of draftBlocks) {
        const directDraftMatches = draftBlock.draftId ? responseEntriesByDraftId.get(draftBlock.draftId) || [] : [];
        const responseEntry = directDraftMatches.shift() || remainingResponseEntries.shift();
        if (!responseEntry) {
          continue;
        }
        const matchedResponseIndex = remainingResponseEntries.indexOf(responseEntry);
        if (matchedResponseIndex >= 0) {
          remainingResponseEntries.splice(matchedResponseIndex, 1);
        }
        const resolvedDraftId = responseSequence.length === 1 && draftBlocks.length === 1 && responseEntry.draftId ? responseEntry.draftId : draftBlock.draftId || responseEntry.draftId || null;
        for (const discoveredUrl of draftBlock.discoveredUrls) {
          bindings.push({
            discoveredUrl,
            assetIds: {
              responseId: responseEntry.responseId,
              draftId: resolvedDraftId,
              conversationId: responseEntry.conversationId
            }
          });
        }
      }
      if (bindings.length > 0) {
        return bindings;
      }
    }
    return extractGeminiAssetBindingsFromParsedHistorySegments(historyNode);
  }
  function collectGeminiResponseBindingAnchors(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const anchors = [];
    for (const match of responseText.matchAll(GEMINI_RESPONSE_BINDING_PATTERN)) {
      const conversationId = match.groups?.conversationId || null;
      const responseId = match.groups?.responseId || null;
      const draftId = match.groups?.draftId || null;
      if (!conversationId && !responseId && !draftId) {
        continue;
      }
      anchors.push({
        index: match.index ?? 0,
        assetIds: {
          responseId,
          draftId,
          conversationId
        }
      });
    }
    return anchors;
  }
  function collectGeminiDraftUrlBlocks(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const blocks = [];
    for (const match of responseText.matchAll(GEMINI_DRAFT_URL_BLOCK_PATTERN)) {
      const draftId = match.groups?.draftId || null;
      const discoveredUrl = normalizeGoogleusercontentImageUrl(
        decodeEscapedRpcUrl(match.groups?.discoveredUrl || "")
      );
      if (!draftId || !isGeminiGeneratedAssetUrl(discoveredUrl)) {
        continue;
      }
      blocks.push({
        index: match.index ?? 0,
        draftId,
        discoveredUrl
      });
    }
    return blocks;
  }
  function extractGeminiAssetBindingsFromResponseText(responseText) {
    if (typeof responseText !== "string" || responseText.length === 0) {
      return [];
    }
    const structuredBindings = [];
    const seenStructuredBindings = /* @__PURE__ */ new Set();
    for (const historyPayload of parseGeminiHistoryPayloadsFromResponseText(responseText)) {
      for (const historyNode of historyPayload) {
        for (const binding of extractGeminiAssetBindingsFromParsedHistoryNode(historyNode)) {
          const bindingKey = `${binding.assetIds.conversationId || ""}|${binding.assetIds.responseId || ""}|${binding.assetIds.draftId || ""}|${binding.discoveredUrl}`;
          if (seenStructuredBindings.has(bindingKey)) {
            continue;
          }
          seenStructuredBindings.add(bindingKey);
          structuredBindings.push(binding);
        }
      }
    }
    if (structuredBindings.length > 0) {
      return structuredBindings;
    }
    const anchors = collectGeminiResponseBindingAnchors(responseText);
    if (anchors.length === 0) {
      return [];
    }
    const bindings = [];
    const seenBindings = /* @__PURE__ */ new Set();
    const draftUrlBlocks = collectGeminiDraftUrlBlocks(responseText);
    for (const block of draftUrlBlocks) {
      const matchingAnchor = [...anchors].reverse().find((anchor) => anchor.index < block.index && anchor.assetIds.draftId === block.draftId);
      if (!matchingAnchor) {
        continue;
      }
      const bindingKey = `${matchingAnchor.assetIds.conversationId || ""}|${matchingAnchor.assetIds.responseId || ""}|${matchingAnchor.assetIds.draftId || ""}|${block.discoveredUrl}`;
      if (seenBindings.has(bindingKey)) {
        continue;
      }
      seenBindings.add(bindingKey);
      bindings.push({
        discoveredUrl: block.discoveredUrl,
        assetIds: {
          ...matchingAnchor.assetIds
        }
      });
    }
    if (bindings.length > 0) {
      return bindings;
    }
    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      const nextAnchor = anchors[index + 1];
      const segment = responseText.slice(anchor.index, nextAnchor?.index ?? responseText.length);
      const discoveredUrls = extractGeminiGeneratedAssetUrlsFromResponseText(segment);
      for (const discoveredUrl of discoveredUrls) {
        const bindingKey = `${anchor.assetIds.conversationId || ""}|${anchor.assetIds.responseId || ""}|${anchor.assetIds.draftId || ""}|${discoveredUrl}`;
        if (seenBindings.has(bindingKey)) {
          continue;
        }
        seenBindings.add(bindingKey);
        bindings.push({
          discoveredUrl,
          assetIds: {
            ...anchor.assetIds
          }
        });
      }
    }
    return bindings;
  }
  function mergeGeminiActionContext(actionContext, assetIds) {
    const baseActionContext = actionContext && typeof actionContext === "object" ? { ...actionContext } : {};
    const mergedAssetIds = {
      ...baseActionContext.assetIds && typeof baseActionContext.assetIds === "object" ? baseActionContext.assetIds : {},
      ...assetIds && typeof assetIds === "object" ? assetIds : {}
    };
    if (!mergedAssetIds.responseId && !mergedAssetIds.draftId && !mergedAssetIds.conversationId) {
      return Object.keys(baseActionContext).length > 0 ? baseActionContext : null;
    }
    return {
      ...baseActionContext,
      assetIds: mergedAssetIds
    };
  }
  async function notifyGeminiOriginalAssetsFromRpcPayload({
    rpcUrl,
    requestAssetIds = null,
    responseText = "",
    provideActionContext = () => null,
    onOriginalAssetDiscovered = null
  } = {}) {
    const actionContext = provideActionContext({ rpcUrl });
    const resolvedActionContext = mergeGeminiActionContext(
      actionContext,
      requestAssetIds
    );
    if (typeof onOriginalAssetDiscovered !== "function") {
      return;
    }
    const responseBindings = extractGeminiAssetBindingsFromResponseText(responseText);
    if (responseBindings.length > 0) {
      for (const binding of responseBindings) {
        const mergedActionContext = mergeGeminiActionContext(
          resolvedActionContext,
          binding.assetIds
        );
        await onOriginalAssetDiscovered(appendCompatibleActionContext({
          rpcUrl,
          discoveredUrl: binding.discoveredUrl
        }, mergedActionContext));
      }
      return;
    }
    if (!resolvedActionContext) {
      return;
    }
    const discoveredUrls = extractGeminiOriginalAssetUrlsFromResponseText(responseText);
    for (const discoveredUrl of discoveredUrls) {
      await onOriginalAssetDiscovered(appendCompatibleActionContext({
        rpcUrl,
        discoveredUrl
      }, resolvedActionContext));
    }
  }
  function createGeminiDownloadRpcFetchHook({
    originalFetch,
    provideActionContext = null,
    getActionContext = () => null,
    onOriginalAssetDiscovered = null,
    logger = console
  }) {
    if (typeof originalFetch !== "function") {
      throw new TypeError("originalFetch must be a function");
    }
    const resolveActionContextProvider = typeof provideActionContext === "function" ? provideActionContext : createActionContextProvider({ getActionContext });
    return async function geminiDownloadRpcFetchHook(...args) {
      if (shouldBypassHook(args)) {
        return originalFetch(...args);
      }
      const input = args[0];
      const rpcUrl = typeof input === "string" ? input : input?.url;
      if (!isGeminiBatchExecuteUrl(rpcUrl)) {
        return originalFetch(...args);
      }
      const response = await originalFetch(...args);
      if (!response?.ok || typeof response.clone !== "function") {
        return response;
      }
      try {
        const requestAssetIds = await extractGeminiAssetIdsFromRpcRequestArgs(args);
        const responseText = await response.clone().text();
        await notifyGeminiOriginalAssetsFromRpcPayload({
          rpcUrl,
          requestAssetIds,
          responseText,
          provideActionContext: () => resolveActionContextProvider({ args, rpcUrl }),
          onOriginalAssetDiscovered
        });
      } catch (error) {
        logger?.warn?.("[Gemini Watermark Remover] Download RPC hook processing failed:", error);
      }
      return response;
    };
  }
  function installGeminiDownloadRpcXmlHttpRequestHook(targetWindow, {
    provideActionContext = null,
    getActionContext = () => null,
    onOriginalAssetDiscovered = null,
    logger = console
  } = {}) {
    if (!targetWindow || typeof targetWindow !== "object") {
      throw new TypeError("targetWindow must be an object");
    }
    const XMLHttpRequestCtor = targetWindow.XMLHttpRequest;
    const prototype = XMLHttpRequestCtor?.prototype;
    if (typeof XMLHttpRequestCtor !== "function" || !prototype || typeof prototype.open !== "function" || typeof prototype.send !== "function") {
      return null;
    }
    const originalOpen = prototype.open;
    const originalSend = prototype.send;
    const resolveActionContextProvider = typeof provideActionContext === "function" ? provideActionContext : createActionContextProvider({ getActionContext });
    prototype.open = function gwrGeminiRpcOpen(method, url, ...rest) {
      this[GEMINI_XHR_HOOK_STATE] = {
        rpcUrl: typeof url === "string" ? url : String(url || ""),
        requestBody: null
      };
      return originalOpen.call(this, method, url, ...rest);
    };
    prototype.send = function gwrGeminiRpcSend(body) {
      const state = this[GEMINI_XHR_HOOK_STATE] || {
        rpcUrl: "",
        requestBody: null
      };
      state.requestBody = body;
      this[GEMINI_XHR_HOOK_STATE] = state;
      if (!this[GEMINI_XHR_HOOK_LISTENER] && typeof this.addEventListener === "function") {
        const handleLoadEnd = () => {
          const currentState = this[GEMINI_XHR_HOOK_STATE];
          const rpcUrl = currentState?.rpcUrl || "";
          if (!isGeminiBatchExecuteUrl(rpcUrl)) {
            return;
          }
          if (typeof this.status === "number" && (this.status < 200 || this.status >= 300)) {
            return;
          }
          if (this.responseType && this.responseType !== "text") {
            return;
          }
          const responseText = typeof this.responseText === "string" ? this.responseText : typeof this.response === "string" ? this.response : "";
          if (!responseText) {
            return;
          }
          void notifyGeminiOriginalAssetsFromRpcPayload({
            rpcUrl,
            requestAssetIds: extractGeminiAssetIdsFromRpcRequestBody(currentState?.requestBody),
            responseText,
            provideActionContext: resolveActionContextProvider,
            onOriginalAssetDiscovered
          }).catch((error) => {
            logger?.warn?.("[Gemini Watermark Remover] Download RPC XHR hook processing failed:", error);
          });
        };
        this[GEMINI_XHR_HOOK_LISTENER] = handleLoadEnd;
        this.addEventListener("loadend", handleLoadEnd);
      }
      return originalSend.call(this, body);
    };
    return {
      dispose() {
        prototype.open = originalOpen;
        prototype.send = originalSend;
      }
    };
  }
  function createGeminiDownloadFetchHook({
    originalFetch,
    isTargetUrl,
    normalizeUrl,
    processBlob,
    provideActionContext = null,
    getActionContext = () => null,
    onOriginalAssetDiscovered = null,
    onProcessedBlobResolved = null,
    onActionCriticalFailure = null,
    shouldProcessRequest = () => true,
    failOpenOnProcessingError = false,
    logger = console,
    cache = /* @__PURE__ */ new Map()
  }) {
    if (typeof originalFetch !== "function") {
      throw new TypeError("originalFetch must be a function");
    }
    if (typeof isTargetUrl !== "function") {
      throw new TypeError("isTargetUrl must be a function");
    }
    if (typeof normalizeUrl !== "function") {
      throw new TypeError("normalizeUrl must be a function");
    }
    if (typeof processBlob !== "function") {
      throw new TypeError("processBlob must be a function");
    }
    if (typeof shouldProcessRequest !== "function") {
      throw new TypeError("shouldProcessRequest must be a function");
    }
    const resolveActionContextProvider = typeof provideActionContext === "function" ? provideActionContext : createActionContextProvider({ getActionContext });
    return async function geminiDownloadFetchHook(...args) {
      if (shouldBypassHook(args)) {
        return originalFetch(...args);
      }
      const input = args[0];
      const url = typeof input === "string" ? input : input?.url;
      if (!isTargetUrl(url)) {
        return originalFetch(...args);
      }
      if (!shouldProcessRequest({ args, url })) {
        return originalFetch(...args);
      }
      const normalizedUrl = normalizeUrl(url);
      const resolvedActionContext = resolveActionContextProvider({ args, url, normalizedUrl });
      if (shouldReuseProcessedDownloadResource(resolvedActionContext)) {
        return buildDirectBlobResponse(
          resolvedActionContext.resource.blob,
          resolvedActionContext.resource.mimeType || ""
        );
      }
      const hookArgs = buildHookRequestArgs(args, normalizedUrl);
      const response = await originalFetch(...hookArgs);
      if (!response?.ok) {
        return response;
      }
      if (!isImageResponse(response)) {
        return response;
      }
      const fallbackResponse = failOpenOnProcessingError && typeof response.clone === "function" ? response.clone() : null;
      try {
        let pendingBlob = cache.get(normalizedUrl);
        if (!pendingBlob) {
          pendingBlob = response.blob().then(async (blob) => {
            const processingContext = {
              url,
              normalizedUrl,
              responseStatus: response.status,
              responseStatusText: response.statusText,
              responseHeaders: serializeResponseHeaders(response.headers)
            };
            if (resolvedActionContext != null) {
              processingContext.actionContext = resolvedActionContext;
            }
            if (typeof onOriginalAssetDiscovered === "function") {
              await onOriginalAssetDiscovered(
                appendCompatibleActionContext(processingContext, resolvedActionContext)
              );
            }
            return processBlob(blob, processingContext);
          }).finally(() => {
            if (cache.get(normalizedUrl) === pendingBlob) {
              cache.delete(normalizedUrl);
            }
          });
          cache.set(normalizedUrl, pendingBlob);
        }
        const processedBlob = await pendingBlob;
        if (typeof onProcessedBlobResolved === "function") {
          await onProcessedBlobResolved(appendCompatibleActionContext({
            url,
            normalizedUrl,
            processedBlob,
            responseStatus: response.status,
            responseStatusText: response.statusText,
            responseHeaders: serializeResponseHeaders(response.headers)
          }, resolvedActionContext));
        }
        return buildProcessedResponse(response, processedBlob);
      } catch (error) {
        logger?.warn?.("[Gemini Watermark Remover] Download hook processing failed:", error);
        if (failOpenOnProcessingError && fallbackResponse) {
          return fallbackResponse;
        }
        await notifyActionCriticalFailure2(onActionCriticalFailure, appendCompatibleActionContext({
          error,
          url,
          normalizedUrl
        }, resolvedActionContext));
        throw error;
      }
    };
  }
  function installGeminiDownloadHook(targetWindow, options) {
    if (!targetWindow || typeof targetWindow !== "object") {
      throw new TypeError("targetWindow must be an object");
    }
    const intentGate = options?.intentGate || createGeminiDownloadIntentGate({
      targetWindow,
      resolveActionContext: options?.resolveActionContext
    });
    const originalFetch = typeof options?.originalFetch === "function" ? options.originalFetch : targetWindow.fetch;
    const onProcessedBlobResolved = async (payload) => {
      await options?.onProcessedBlobResolved?.(payload);
      if (payload?.actionContext?.action === "download") {
        intentGate.release();
      }
    };
    const onActionCriticalFailure = async (payload) => {
      await options?.onActionCriticalFailure?.(payload);
      if (payload?.actionContext?.action === "download") {
        intentGate.release();
      }
    };
    const hook = createGeminiDownloadFetchHook({
      ...options,
      getActionContext: ({ url = "", normalizedUrl = "" } = {}) => getActionContextFromIntentGate(
        intentGate,
        { normalizedUrl, url }
      ),
      onProcessedBlobResolved,
      onActionCriticalFailure,
      shouldProcessRequest: options?.shouldProcessRequest || (({ url = "", normalizedUrl = "" } = {}) => intentGate.hasRecentIntent({ normalizedUrl, url })),
      originalFetch
    });
    targetWindow.fetch = hook;
    return hook;
  }

  // src/userscript/crossOriginFetch.js
  function parseMimeTypeFromResponseHeaders(responseHeaders) {
    if (typeof responseHeaders !== "string" || responseHeaders.length === 0) {
      return "";
    }
    const lines = responseHeaders.split(/\r?\n/);
    for (const line of lines) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) continue;
      const name = line.slice(0, separatorIndex).trim().toLowerCase();
      if (name !== "content-type") continue;
      return line.slice(separatorIndex + 1).trim().split(";")[0].trim().toLowerCase();
    }
    return "";
  }
  async function fetchBlobWithStandardFetch(fetchImpl, url) {
    const response = await fetchImpl(url, {
      credentials: "omit",
      redirect: "follow"
    });
    if (!response?.ok) {
      throw new Error(`Failed to fetch image: ${response?.status || 0}`);
    }
    return response.blob();
  }
  async function fetchBlobWithUserscriptRequest(gmRequest, url) {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: "GET",
        url,
        responseType: "arraybuffer",
        onload: (response) => {
          const status = Number(response?.status) || 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Failed to fetch image: ${status}`));
            return;
          }
          const mimeType = parseMimeTypeFromResponseHeaders(response?.responseHeaders) || "image/png";
          resolve(new Blob([response.response], { type: mimeType }));
        },
        onerror: () => {
          reject(new Error("Failed to fetch image"));
        },
        ontimeout: () => {
          reject(new Error("Failed to fetch image: timeout"));
        }
      });
    });
  }
  function isCrossOriginGoogleusercontentUrl(url) {
    try {
      const parsedUrl = new URL(String(url || ""));
      return /^https?:$/i.test(parsedUrl.protocol) && /(^|\.)googleusercontent\.com$/i.test(parsedUrl.hostname);
    } catch {
      return false;
    }
  }
  function createUserscriptBlobFetcher({
    gmRequest = globalThis.GM_xmlhttpRequest,
    fallbackFetch = globalThis.fetch?.bind(globalThis) || null
  } = {}) {
    return async function fetchPreviewBlob(url) {
      if (typeof gmRequest === "function") {
        return fetchBlobWithUserscriptRequest(gmRequest, url);
      }
      if (isCrossOriginGoogleusercontentUrl(url)) {
        throw new Error("Cross-origin preview fetch requires GM_xmlhttpRequest");
      }
      if (typeof fallbackFetch === "function") {
        return fetchBlobWithStandardFetch(fallbackFetch, url);
      }
      throw new Error("Failed to fetch image");
    };
  }

  // src/userscript/pageProcessBridge.js
  var PAGE_PROCESS_REQUEST = "gwr:page-process-request";
  var PAGE_PROCESS_RESPONSE = "gwr:page-process-response";
  function isAllowedMessageSource(eventSource, targetWindow) {
    if (!targetWindow || !eventSource) {
      return true;
    }
    if (eventSource === targetWindow) {
      return true;
    }
    try {
      if (eventSource.window === targetWindow || eventSource.self === targetWindow) {
        return true;
      }
    } catch {
    }
    try {
      if (targetWindow.window === eventSource || targetWindow.self === eventSource) {
        return true;
      }
    } catch {
    }
    return false;
  }
  function buildBlobResult(processedBlob, processedMeta = null) {
    return {
      processedBlob,
      processedMeta
    };
  }
  function createRequestId() {
    return `gwr-page-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function createBlobResultFromResponse(result = {}) {
    return {
      processedBlob: new Blob([result.processedBuffer], {
        type: result.mimeType || "image/png"
      }),
      processedMeta: result.meta ?? null
    };
  }
  function sanitizeSerializableAssetIds(assetIds = null) {
    if (!assetIds || typeof assetIds !== "object") {
      return null;
    }
    const sanitized = {};
    for (const key of ["responseId", "draftId", "conversationId"]) {
      if (typeof assetIds[key] === "string" && assetIds[key].trim()) {
        sanitized[key] = assetIds[key].trim();
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
  function sanitizeSerializableResource(resource = null) {
    if (!resource || typeof resource !== "object") {
      return null;
    }
    const sanitized = {};
    for (const key of ["kind", "url", "mimeType", "source", "slot"]) {
      if (typeof resource[key] === "string" && resource[key].trim()) {
        sanitized[key] = resource[key].trim();
      }
    }
    if (resource.processedMeta != null) {
      sanitized.processedMeta = resource.processedMeta;
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
  function sanitizeSerializableActionContext(actionContext = null) {
    if (!actionContext || typeof actionContext !== "object") {
      return null;
    }
    const sanitized = {};
    if (typeof actionContext.action === "string" && actionContext.action.trim()) {
      sanitized.action = actionContext.action.trim();
    }
    if (typeof actionContext.sessionKey === "string" && actionContext.sessionKey.trim()) {
      sanitized.sessionKey = actionContext.sessionKey.trim();
    }
    const assetIds = sanitizeSerializableAssetIds(actionContext.assetIds);
    if (assetIds) {
      sanitized.assetIds = assetIds;
    }
    const resource = sanitizeSerializableResource(actionContext.resource);
    if (resource) {
      sanitized.resource = resource;
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
  function sanitizePageProcessOptions(options = {}) {
    if (!options || typeof options !== "object") {
      return {};
    }
    const sanitized = { ...options };
    const actionContext = sanitizeSerializableActionContext(options.actionContext);
    delete sanitized.actionContext;
    if (actionContext) {
      sanitized.actionContext = actionContext;
    }
    return sanitized;
  }
  function createPageProcessBridgeClient({
    targetWindow = globalThis.window || null,
    timeoutMs = 12e4,
    fallbackProcessWatermarkBlob,
    fallbackRemoveWatermarkFromBlob,
    logger = console
  } = {}) {
    async function request(action, blob, options, fallback) {
      if (!(blob instanceof Blob)) {
        throw new TypeError("blob must be a Blob");
      }
      if (!targetWindow || typeof targetWindow.addEventListener !== "function" || typeof targetWindow.removeEventListener !== "function" || typeof targetWindow.postMessage !== "function") {
        return fallback(blob, options);
      }
      const inputBuffer = await blob.arrayBuffer();
      const requestId = createRequestId();
      const sanitizedOptions = sanitizePageProcessOptions(options);
      try {
        return await new Promise((resolve, reject) => {
          const cleanup = () => {
            targetWindow.removeEventListener("message", handleMessage);
            globalThis.clearTimeout(timeoutId);
          };
          const handleMessage = (event) => {
            if (!isAllowedMessageSource(event?.source, targetWindow)) {
              return;
            }
            if (!event?.data || event.data.type !== PAGE_PROCESS_RESPONSE) {
              return;
            }
            if (event.data.requestId !== requestId) {
              return;
            }
            cleanup();
            if (event.data.ok === false) {
              reject(new Error(normalizeErrorMessage(event.data.error, "Page bridge failed")));
              return;
            }
            resolve(createBlobResultFromResponse(event.data.result));
          };
          const timeoutId = globalThis.setTimeout(() => {
            cleanup();
            reject(new Error(`Page bridge timed out: ${action}`));
          }, timeoutMs);
          targetWindow.addEventListener("message", handleMessage);
          targetWindow.postMessage({
            type: PAGE_PROCESS_REQUEST,
            requestId,
            action,
            inputBuffer,
            mimeType: blob.type || "image/png",
            options: sanitizedOptions
          }, "*", [inputBuffer]);
        });
      } catch (error) {
        logger?.warn?.("[Gemini Watermark Remover] Page bridge fallback:", error);
        return fallback(blob, options);
      }
    }
    return {
      async processWatermarkBlob(blob, options = {}) {
        if (typeof fallbackProcessWatermarkBlob !== "function") {
          throw new Error("fallbackProcessWatermarkBlob must be a function");
        }
        return request("process-watermark-blob", blob, options, fallbackProcessWatermarkBlob);
      },
      async removeWatermarkFromBlob(blob, options = {}) {
        if (typeof fallbackRemoveWatermarkFromBlob !== "function") {
          throw new Error("fallbackRemoveWatermarkFromBlob must be a function");
        }
        const result = await request("remove-watermark-blob", blob, options, async (inputBlob, inputOptions) => {
          const processedBlob = await fallbackRemoveWatermarkFromBlob(inputBlob, inputOptions);
          return buildBlobResult(processedBlob, null);
        });
        return result.processedBlob;
      }
    };
  }

  // src/userscript/historyBindingBootstrap.js
  var GEMINI_HISTORY_RPC_ID = "hNvQHb";
  var GEMINI_HISTORY_PAGE_SIZE = 10;
  function normalizeConversationRouteSegment(segment = "") {
    const normalizedSegment = String(segment || "").trim().replace(/^\/+|\/+$/g, "");
    if (!normalizedSegment || normalizedSegment === "app") {
      return "";
    }
    if (normalizedSegment.startsWith("c_")) {
      return normalizedSegment;
    }
    return `c_${normalizedSegment}`;
  }
  function extractGeminiConversationIdFromPath(pathname = "") {
    const normalizedPath = String(pathname || "").trim();
    if (!normalizedPath) {
      return "";
    }
    const segments = normalizedPath.split("/").filter(Boolean);
    const appIndex = segments.indexOf("app");
    if (appIndex < 0) {
      return "";
    }
    return normalizeConversationRouteSegment(segments[appIndex + 1] || "");
  }
  function getGeminiBootstrapRpcConfig(targetWindow = globalThis.window || null) {
    const bootstrapData = targetWindow?.WIZ_global_data;
    if (!bootstrapData || typeof bootstrapData !== "object") {
      return null;
    }
    const at = typeof bootstrapData.SNlM0e === "string" ? bootstrapData.SNlM0e.trim() : "";
    const buildLabel = typeof bootstrapData.cfb2h === "string" ? bootstrapData.cfb2h.trim() : "";
    const sessionId = typeof bootstrapData.FdrFJe === "string" ? bootstrapData.FdrFJe.trim() : "";
    const endpointBase = typeof bootstrapData.eptZe === "string" ? bootstrapData.eptZe.trim() : "";
    if (!at || !buildLabel || !sessionId || !endpointBase) {
      return null;
    }
    return {
      at,
      buildLabel,
      sessionId,
      endpointBase
    };
  }
  function buildGeminiConversationHistoryRequest({
    origin = "https://gemini.google.com",
    sourcePath = "/app",
    hl = "en",
    reqId = 1e5,
    conversationId = "",
    rpcConfig = null,
    pageSize = GEMINI_HISTORY_PAGE_SIZE
  } = {}) {
    if (!conversationId || !rpcConfig) {
      return null;
    }
    const endpointBase = String(rpcConfig.endpointBase || "").trim();
    const endpointPath = endpointBase.endsWith("/") ? `${endpointBase}data/batchexecute` : `${endpointBase}/data/batchexecute`;
    const url = new URL(endpointPath, origin);
    url.searchParams.set("rpcids", GEMINI_HISTORY_RPC_ID);
    url.searchParams.set("source-path", sourcePath || "/app");
    url.searchParams.set("bl", rpcConfig.buildLabel);
    url.searchParams.set("f.sid", rpcConfig.sessionId);
    url.searchParams.set("hl", hl || "en");
    url.searchParams.set("_reqid", String(reqId));
    url.searchParams.set("rt", "c");
    const payload = [[[
      GEMINI_HISTORY_RPC_ID,
      JSON.stringify([conversationId, pageSize, null, 1, [0], [4], null, 1]),
      null,
      "generic"
    ]]];
    return {
      url: url.toString(),
      init: {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: `f.req=${encodeURIComponent(JSON.stringify(payload))}&at=${encodeURIComponent(rpcConfig.at)}&`
      }
    };
  }
  var historyReqCounter = 0;
  function nextHistoryReqId() {
    historyReqCounter = (historyReqCounter + 1e5) % 9e5;
    return 1e5 + historyReqCounter;
  }
  async function requestGeminiConversationHistoryBindings({
    targetWindow = globalThis.window || null,
    fetchImpl = null,
    onResponseText = null,
    logger = console
  } = {}) {
    if (!targetWindow || typeof targetWindow !== "object") {
      return false;
    }
    const conversationId = extractGeminiConversationIdFromPath(targetWindow.location?.pathname || "");
    if (!conversationId) {
      return false;
    }
    const rpcConfig = getGeminiBootstrapRpcConfig(targetWindow);
    if (!rpcConfig) {
      return false;
    }
    const request = buildGeminiConversationHistoryRequest({
      origin: targetWindow.location?.origin || "https://gemini.google.com",
      sourcePath: targetWindow.location?.pathname || "/app",
      hl: targetWindow.document?.documentElement?.lang || targetWindow.navigator?.language || "en",
      reqId: nextHistoryReqId(),
      conversationId,
      rpcConfig
    });
    if (!request) {
      return false;
    }
    const effectiveFetch = typeof fetchImpl === "function" ? fetchImpl : targetWindow.fetch?.bind(targetWindow);
    if (typeof effectiveFetch !== "function") {
      return false;
    }
    try {
      const response = await effectiveFetch(request.url, request.init);
      if (typeof onResponseText === "function" && response) {
        const responseText = typeof response.clone === "function" ? await response.clone().text() : await response.text();
        await onResponseText(responseText, {
          request,
          response
        });
      }
      return true;
    } catch (error) {
      logger?.warn?.("[Gemini Watermark Remover] Conversation history bootstrap failed:", error);
      return false;
    }
  }

  // src/userscript/processBridge.js
  var USERSCRIPT_PROCESS_REQUEST = "gwr:userscript-process-request";
  var USERSCRIPT_PROCESS_RESPONSE = "gwr:userscript-process-response";
  var USERSCRIPT_PROCESS_BRIDGE_FLAG = "__gwrUserscriptProcessBridgeInstalled__";
  function buildBlobResult2(processedBlob, processedMeta = null) {
    return {
      processedBlob,
      processedMeta
    };
  }
  async function blobResultToPayload(result) {
    const normalizedResult = result instanceof Blob ? buildBlobResult2(result, null) : buildBlobResult2(result?.processedBlob, result?.processedMeta ?? null);
    const processedBlob = normalizedResult.processedBlob;
    if (!(processedBlob instanceof Blob)) {
      throw new Error("Bridge processor must return a Blob");
    }
    const processedBuffer = await processedBlob.arrayBuffer();
    return {
      processedBuffer,
      mimeType: processedBlob.type || "image/png",
      meta: normalizedResult.processedMeta ?? null
    };
  }
  function createUserscriptProcessBridgeServer({
    targetWindow = globalThis.window || null,
    processWatermarkBlob: processWatermarkBlob2,
    removeWatermarkFromBlob: removeWatermarkFromBlob2,
    logger = console
  } = {}) {
    return async function handleUserscriptProcessBridge(event) {
      if (!event?.data || event.data.type !== USERSCRIPT_PROCESS_REQUEST) {
        return;
      }
      if (targetWindow && event.source && event.source !== targetWindow) {
        return;
      }
      if (!targetWindow || typeof targetWindow.postMessage !== "function") {
        return;
      }
      const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
      const action = typeof event.data.action === "string" ? event.data.action : "";
      if (!requestId || !action) {
        return;
      }
      try {
        const inputBlob = new Blob([event.data.inputBuffer], {
          type: event.data.mimeType || "image/png"
        });
        let result;
        if (action === "process-watermark-blob") {
          if (typeof processWatermarkBlob2 !== "function") {
            throw new Error("processWatermarkBlob bridge handler unavailable");
          }
          result = await processWatermarkBlob2(inputBlob, event.data.options || {});
        } else if (action === "remove-watermark-blob") {
          if (typeof removeWatermarkFromBlob2 !== "function") {
            throw new Error("removeWatermarkFromBlob bridge handler unavailable");
          }
          result = await removeWatermarkFromBlob2(inputBlob, event.data.options || {});
        } else {
          throw new Error(`Unknown bridge action: ${action}`);
        }
        const payload = await blobResultToPayload(result);
        targetWindow.postMessage({
          type: USERSCRIPT_PROCESS_RESPONSE,
          requestId,
          ok: true,
          action,
          result: payload
        }, "*", [payload.processedBuffer]);
      } catch (error) {
        logger?.warn?.("[Gemini Watermark Remover] Userscript bridge request failed:", error);
        targetWindow.postMessage({
          type: USERSCRIPT_PROCESS_RESPONSE,
          requestId,
          ok: false,
          action,
          error: normalizeErrorMessage(error, "Userscript bridge failed")
        }, "*");
      }
    };
  }
  function installUserscriptProcessBridge(options = {}) {
    const {
      targetWindow = globalThis.window || null
    } = options;
    if (!targetWindow || typeof targetWindow.addEventListener !== "function") {
      return null;
    }
    if (targetWindow[USERSCRIPT_PROCESS_BRIDGE_FLAG]) {
      return targetWindow[USERSCRIPT_PROCESS_BRIDGE_FLAG];
    }
    const handler = createUserscriptProcessBridgeServer({
      ...options,
      targetWindow
    });
    const listener = (event) => {
      void handler(event);
    };
    targetWindow.addEventListener("message", listener);
    targetWindow[USERSCRIPT_PROCESS_BRIDGE_FLAG] = {
      handler,
      dispose() {
        targetWindow.removeEventListener?.("message", listener);
        delete targetWindow[USERSCRIPT_PROCESS_BRIDGE_FLAG];
      }
    };
    return targetWindow[USERSCRIPT_PROCESS_BRIDGE_FLAG];
  }

  // src/userscript/trustedTypes.js
  var USERSCRIPT_TRUSTED_TYPES_POLICY = "gemini-watermark-remover";
  function getUserscriptTrustedTypesPolicy(env = globalThis) {
    const trustedTypesApi = env?.trustedTypes;
    if (!trustedTypesApi || typeof trustedTypesApi.createPolicy !== "function") {
      return null;
    }
    try {
      const existingPolicy = typeof trustedTypesApi.getPolicy === "function" ? trustedTypesApi.getPolicy(USERSCRIPT_TRUSTED_TYPES_POLICY) : null;
      return existingPolicy || trustedTypesApi.createPolicy(
        USERSCRIPT_TRUSTED_TYPES_POLICY,
        {
          createScript: (value) => value,
          createScriptURL: (value) => value
        }
      );
    } catch {
      return null;
    }
  }
  function toTrustedScript(script, env = globalThis) {
    const policy = getUserscriptTrustedTypesPolicy(env);
    if (!policy) return script;
    if (typeof policy.createScript !== "function") return null;
    try {
      return policy.createScript(script);
    } catch {
      return null;
    }
  }
  function toTrustedScriptUrl(url, env = globalThis) {
    const policy = getUserscriptTrustedTypesPolicy(env);
    if (!policy) return url;
    if (typeof policy.createScriptURL !== "function") return null;
    try {
      return policy.createScriptURL(url);
    } catch {
      return null;
    }
  }
  function toWorkerScriptUrl(url, env = globalThis) {
    return toTrustedScriptUrl(url, env);
  }

  // src/userscript/pageProcessorRuntime.js
  var PAGE_PROCESSOR_SCRIPT_FLAG = "__gwrPageProcessorScriptInstalled__";
  var PAGE_PROCESS_RUNTIME_FLAG = "__gwrPageProcessRuntimeInstalled__";
  var PAGE_PROCESSOR_SCRIPT_TIMEOUT_MS = 5e3;
  function getExistingScriptNonce(documentRef) {
    const existingScript = documentRef?.querySelector?.("script[nonce]");
    const nonce = existingScript?.nonce || existingScript?.getAttribute?.("nonce") || "";
    return typeof nonce === "string" && nonce.length > 0 ? nonce : "";
  }
  function applyScriptNonce(script, nonce) {
    if (!script || !nonce) {
      return;
    }
    script.nonce = nonce;
    script.setAttribute?.("nonce", nonce);
  }
  function createScriptElement(documentRef, nonce) {
    const script = documentRef.createElement("script");
    applyScriptNonce(script, nonce);
    return script;
  }
  function appendRuntimeScript(documentRef, script) {
    const parent = documentRef.head || documentRef.documentElement || documentRef.body;
    parent?.appendChild(script);
  }
  async function injectInlineRuntimeScript({
    targetWindow,
    documentRef,
    scriptCode,
    nonce
  }) {
    const script = createScriptElement(documentRef, nonce);
    const trustedScript = toTrustedScript(scriptCode, targetWindow);
    if (!trustedScript) {
      throw new Error("Trusted Types script injection unavailable");
    }
    script.textContent = trustedScript;
    appendRuntimeScript(documentRef, script);
    script.remove();
    return targetWindow[PAGE_PROCESS_RUNTIME_FLAG] || null;
  }
  async function injectBlobRuntimeScript({
    targetWindow,
    documentRef,
    scriptCode,
    nonce
  }) {
    const script = createScriptElement(documentRef, nonce);
    const blobUrl = URL.createObjectURL(new Blob([scriptCode], {
      type: "text/javascript"
    }));
    const trustedScriptUrl = toTrustedScriptUrl(blobUrl, targetWindow);
    if (!trustedScriptUrl) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Trusted Types script URL injection unavailable");
    }
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          targetWindow.clearTimeout?.(timeoutId);
          script.onload = null;
          script.onerror = null;
        };
        const timeoutId = targetWindow.setTimeout?.(() => {
          cleanup();
          reject(new Error("Page runtime blob injection timed out"));
        }, PAGE_PROCESSOR_SCRIPT_TIMEOUT_MS);
        script.onload = () => {
          cleanup();
          resolve();
        };
        script.onerror = () => {
          cleanup();
          reject(new Error("Page runtime blob injection failed"));
        };
        script.src = trustedScriptUrl;
        appendRuntimeScript(documentRef, script);
      });
    } finally {
      script.remove();
      URL.revokeObjectURL(blobUrl);
    }
    return targetWindow[PAGE_PROCESS_RUNTIME_FLAG] || null;
  }
  async function installInjectedPageProcessorRuntime({
    targetWindow = globalThis.window || null,
    scriptCode = "",
    logger = console
  } = {}) {
    if (!targetWindow || typeof scriptCode !== "string" || scriptCode.length === 0) {
      return null;
    }
    if (targetWindow[PAGE_PROCESS_RUNTIME_FLAG]) {
      return targetWindow[PAGE_PROCESS_RUNTIME_FLAG];
    }
    if (targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG]) {
      return targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG];
    }
    const documentRef = targetWindow.document;
    if (!documentRef || typeof documentRef.createElement !== "function") {
      return null;
    }
    const nonce = getExistingScriptNonce(documentRef);
    try {
      const inlineRuntime = await injectInlineRuntimeScript({
        targetWindow,
        documentRef,
        scriptCode,
        nonce
      });
      if (inlineRuntime) {
        targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG] = inlineRuntime;
        return inlineRuntime;
      }
      logger?.info?.("[Gemini Watermark Remover] Page runtime inline injection did not register, retrying with blob script");
      const blobRuntime = await injectBlobRuntimeScript({
        targetWindow,
        documentRef,
        scriptCode,
        nonce
      });
      if (blobRuntime) {
        targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG] = blobRuntime;
        return blobRuntime;
      }
    } catch (error) {
      logger?.warn?.("[Gemini Watermark Remover] Page runtime injection failed:", error);
      return null;
    }
    if (!targetWindow[PAGE_PROCESS_RUNTIME_FLAG]) {
      logger?.warn?.("[Gemini Watermark Remover] Page runtime injection did not register a bridge");
      return null;
    }
    targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG] = targetWindow[PAGE_PROCESS_RUNTIME_FLAG];
    return targetWindow[PAGE_PROCESSOR_SCRIPT_FLAG];
  }

  // src/userscript/runtimeFlags.js
  var INLINE_WORKER_DEFAULT_ENABLED = true ? false : false;
  var FORCE_INLINE_WORKER_STORAGE_KEY = "__gwr_force_inline_worker__";
  var DEBUG_TIMINGS_STORAGE_KEY = "__gwr_debug_timings__";
  function isTruthyFlagValue(value) {
    return value === true || value === "1" || value === "true";
  }
  function readStorageFlag(env, storageKey) {
    try {
      const value = env?.localStorage?.getItem?.(storageKey);
      return isTruthyFlagValue(value);
    } catch {
      return false;
    }
  }
  function readForceInlineWorkerFlag(env) {
    try {
      return isTruthyFlagValue(env?.__GWR_FORCE_INLINE_WORKER__);
    } catch {
      return false;
    }
  }
  function shouldUseInlineWorker(workerCode, env = globalThis) {
    const unsafeWindowEnv = env?.unsafeWindow;
    const forceEnable = readForceInlineWorkerFlag(env) || readForceInlineWorkerFlag(unsafeWindowEnv) || readStorageFlag(env, FORCE_INLINE_WORKER_STORAGE_KEY) || readStorageFlag(unsafeWindowEnv, FORCE_INLINE_WORKER_STORAGE_KEY);
    if (!INLINE_WORKER_DEFAULT_ENABLED && !forceEnable) return false;
    if (typeof workerCode !== "string" || workerCode.length === 0) return false;
    return typeof env?.Worker !== "undefined" && typeof env?.Blob !== "undefined";
  }
  function isTimingDebugEnabled(env = globalThis) {
    const unsafeWindowEnv = env?.unsafeWindow;
    return isTruthyFlagValue(env?.__GWR_DEBUG_TIMINGS__) || isTruthyFlagValue(unsafeWindowEnv?.__GWR_DEBUG_TIMINGS__) || readStorageFlag(env, DEBUG_TIMINGS_STORAGE_KEY) || readStorageFlag(unsafeWindowEnv, DEBUG_TIMINGS_STORAGE_KEY);
  }

  // src/userscript/processingRuntime.js
  var DEFAULT_INLINE_WORKER_TIMEOUT_MS = 12e4;
  var DEFAULT_WORKER_PING_TIMEOUT_MS = 3e3;
  var loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  function toError(errorLike, fallback = "Inline worker error") {
    if (errorLike instanceof Error) return errorLike;
    if (typeof errorLike === "string" && errorLike.length > 0) return new Error(errorLike);
    if (errorLike && typeof errorLike.message === "string" && errorLike.message.length > 0) {
      return new Error(errorLike.message);
    }
    return new Error(fallback);
  }
  function nowMs3() {
    if (typeof globalThis.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }
  var InlineWorkerClient = class {
    constructor(workerCode) {
      const blob = new Blob([workerCode], { type: "text/javascript" });
      this.workerUrl = URL.createObjectURL(blob);
      const workerScriptUrl = toWorkerScriptUrl(this.workerUrl);
      if (!workerScriptUrl) {
        URL.revokeObjectURL(this.workerUrl);
        this.workerUrl = null;
        throw new Error("Trusted Types policy unavailable for inline worker");
      }
      try {
        this.worker = new Worker(workerScriptUrl);
      } catch (error) {
        URL.revokeObjectURL(this.workerUrl);
        this.workerUrl = null;
        throw error;
      }
      this.pending = /* @__PURE__ */ new Map();
      this.requestId = 0;
      this.handleMessage = this.handleMessage.bind(this);
      this.handleError = this.handleError.bind(this);
      this.worker.addEventListener("message", this.handleMessage);
      this.worker.addEventListener("error", this.handleError);
    }
    dispose() {
      this.worker.removeEventListener("message", this.handleMessage);
      this.worker.removeEventListener("error", this.handleError);
      this.worker.terminate();
      if (this.workerUrl) {
        URL.revokeObjectURL(this.workerUrl);
        this.workerUrl = null;
      }
      const error = new Error("Inline worker disposed");
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      this.pending.clear();
    }
    handleMessage(event) {
      const payload = event?.data;
      if (!payload || typeof payload.id === "undefined") return;
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      clearTimeout(pending.timeoutId);
      if (payload.ok) {
        pending.resolve(payload.result);
        return;
      }
      pending.reject(new Error(payload.error?.message || "Inline worker request failed"));
    }
    handleError(event) {
      const error = new Error(event?.message || "Inline worker crashed");
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      this.pending.clear();
    }
    request(type, payload, transferList = [], timeoutMs = DEFAULT_INLINE_WORKER_TIMEOUT_MS) {
      const id = ++this.requestId;
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Inline worker request timed out: ${type}`));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timeoutId });
        try {
          this.worker.postMessage({ id, type, ...payload }, transferList);
        } catch (error) {
          clearTimeout(timeoutId);
          this.pending.delete(id);
          reject(toError(error));
        }
      });
    }
    async ping(timeoutMs = DEFAULT_WORKER_PING_TIMEOUT_MS) {
      await this.request("ping", {}, [], timeoutMs);
    }
    async processWatermarkBlob(blob, options = {}) {
      const inputBuffer = await blob.arrayBuffer();
      const result = await this.request(
        "process-image",
        { inputBuffer, mimeType: blob.type || "image/png", options },
        [inputBuffer]
      );
      return {
        processedBlob: new Blob([result.processedBuffer], { type: result.mimeType || "image/png" }),
        processedMeta: result.meta || null
      };
    }
  };
  function createUserscriptProcessingRuntime({
    workerCode = "",
    env = globalThis,
    logger = console
  } = {}) {
    let enginePromise = null;
    let workerClient = null;
    const timingDebugEnabled = isTimingDebugEnabled(env);
    function normalizeProcessingOptions2(options = {}) {
      return {
        adaptiveMode: "always",
        ...options && typeof options === "object" ? options : {}
      };
    }
    async function getEngine() {
      if (!enginePromise) {
        enginePromise = WatermarkEngine.create().catch((error) => {
          enginePromise = null;
          throw error;
        });
      }
      return enginePromise;
    }
    function disableInlineWorker(reason) {
      if (!workerClient) return;
      logger?.warn?.("[Gemini Watermark Remover] Disable worker path:", reason);
      workerClient.dispose();
      workerClient = null;
    }
    function emitTiming(stage, payload = {}) {
      if (!timingDebugEnabled) return;
      logger?.info?.(`[Gemini Watermark Remover] timing ${stage}`, payload);
    }
    async function processBlobOnMainThread(blob, options = {}) {
      const startedAt = nowMs3();
      const engineWaitStartedAt = nowMs3();
      const engine = await getEngine();
      const engineWaitMs = nowMs3() - engineWaitStartedAt;
      const blobUrl = URL.createObjectURL(blob);
      try {
        const decodeStartedAt = nowMs3();
        const img = await loadImage(blobUrl);
        const decodeMs = nowMs3() - decodeStartedAt;
        const removeStartedAt = nowMs3();
        const canvas = await engine.removeWatermarkFromImage(img, {
          ...options,
          debugTimings: timingDebugEnabled
        });
        const removeWatermarkMs = nowMs3() - removeStartedAt;
        const encodeStartedAt = nowMs3();
        const processedBlob = await canvasToBlob(canvas);
        const encodeMs = nowMs3() - encodeStartedAt;
        const totalMs = nowMs3() - startedAt;
        const engineStageTimings = canvas?.__watermarkTiming ?? null;
        const processorTimings = engineStageTimings?.processor ?? null;
        const selectionDebug = canvas?.__watermarkMeta?.selectionDebug ?? null;
        emitTiming("process-blob-main-thread", {
          sourceBlobType: blob?.type || "",
          sourceBlobSize: blob?.size || 0,
          imageWidth: img?.width || 0,
          imageHeight: img?.height || 0,
          engineWaitMs,
          decodeMs,
          removeWatermarkMs,
          encodeMs,
          totalMs,
          adaptiveMode: options?.adaptiveMode || "",
          maxPasses: options?.maxPasses ?? null,
          engineStageTimings,
          engineDrawMs: engineStageTimings?.drawMs ?? null,
          engineGetImageDataMs: engineStageTimings?.getImageDataMs ?? null,
          engineProcessWatermarkImageDataMs: engineStageTimings?.processWatermarkImageDataMs ?? null,
          enginePutImageDataMs: engineStageTimings?.putImageDataMs ?? null,
          processorInitialSelectionMs: processorTimings?.initialSelectionMs ?? null,
          processorFirstPassMetricsMs: processorTimings?.firstPassMetricsMs ?? null,
          processorExtraPassMs: processorTimings?.extraPassMs ?? null,
          processorFinalMetricsMs: processorTimings?.finalMetricsMs ?? null,
          processorRecalibrationMs: processorTimings?.recalibrationMs ?? null,
          processorSubpixelRefinementMs: processorTimings?.subpixelRefinementMs ?? null,
          processorPreviewEdgeCleanupMs: processorTimings?.previewEdgeCleanupMs ?? null,
          processorTotalMs: processorTimings?.totalMs ?? null,
          selectionDebug
        });
        return {
          processedBlob,
          processedMeta: canvas.__watermarkMeta || null
        };
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    async function processBlobWithBestPath(blob, options = {}) {
      const normalizedOptions = normalizeProcessingOptions2(options);
      if (workerClient) {
        try {
          return await workerClient.processWatermarkBlob(blob, normalizedOptions);
        } catch (error) {
          logger?.warn?.("[Gemini Watermark Remover] Worker path failed, fallback to main thread:", error);
          disableInlineWorker(error);
        }
      }
      return processBlobOnMainThread(blob, normalizedOptions);
    }
    const runtime = {
      async initialize() {
        if (!shouldUseInlineWorker(workerCode, env)) {
          return false;
        }
        try {
          workerClient = new InlineWorkerClient(workerCode);
          await workerClient.ping();
          logger?.log?.("[Gemini Watermark Remover] Worker acceleration enabled");
          return true;
        } catch (workerError) {
          workerClient?.dispose();
          workerClient = null;
          logger?.warn?.("[Gemini Watermark Remover] Worker initialization failed, using main thread:", workerError);
          return false;
        }
      },
      dispose(reason) {
        disableInlineWorker(reason);
      },
      async processWatermarkBlob(blob, options = {}) {
        return processBlobWithBestPath(blob, options);
      },
      async removeWatermarkFromBlob(blob, options = {}) {
        return (await runtime.processWatermarkBlob(blob, options)).processedBlob;
      }
    };
    return runtime;
  }

  // src/userscript/userNotice.js
  var GWR_ORIGINAL_ASSET_REFRESH_MESSAGE = "\u65E0\u6CD5\u83B7\u53D6\u539F\u56FE\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5";
  function showUserNotice(targetWindow = globalThis, message = "") {
    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    if (!normalizedMessage) {
      return false;
    }
    try {
      if (typeof targetWindow?.alert === "function") {
        targetWindow.alert(normalizedMessage);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // src/userscript/index.js
  var USERSCRIPT_WORKER_CODE = true ? '(()=>{var bg={48:2304,96:9216},LA={48:"gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAADj4uI+4eDgPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDvBwEA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4WEBD6BgAA/gYAAP4GAAD4AAAAAgYAAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8wcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYAAPIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO5GQkD6BgAA/gYAAP5GQkD4AAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADwAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAO+Hg4D6BgAA/gYAAP/Hw8D4AAAAAgYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPoGAAD+BgAA/gYAAP4GAAD+BgAA+AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAADwAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7AAAAAAAAAACBgIA7oaCgPoGAAD+BgAA/gYAAP4GAAD/BwMA+AAAAAAAAAACBgIA7AAAAAIGAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAwcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADwAAAAAAAAAAIGAADyJiIg9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgIA7AAAAAAAAAAAAAAAAgYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAADwAAAAAgYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO8HAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/o6KiPoGAgDuBgAA8AAAAAIGAgDuBgIA7gYCAO8HAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPAAAAAAAAAAAgYCAO4GAADyBgIA7gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAADyBgAA8gYCAO4mIiD2BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD6BgAA8gYCAO4GAADwAAAAAgYCAO4GAADyBgIA7wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7AAAAAIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO+Hg4D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDsAAAAAAAAAAIGAgDuBgAA8AAAAAIGAgDuBgIA7AAAAAAAAAAAAAAAAgYAAPIGAgDuBgIA7gYAAPAAAAACBgIA7gYCAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4GA+AAAAAAAAAACBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAACBgIA7gYCAO8HAQDwAAAAAgYCAO4GAADwAAAAAgYAAPAAAAACBgAA8gYCAOwAAAACBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+wcDAPYGAgDuBgAA8wcBAPIGAADyBgAA8gYAAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAACBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7AAAAAMHAQDyBgAA8gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAAD2BgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAOwAAAACBgIA7AAAAAAAAAACBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO9PS0j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPIGAgDuBgIA7o6KiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+hoKA+gYCAOwAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPgAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAADwAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPcHAwD6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgIA9gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgIA7gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAADBwMA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+iYiIPYGAgDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAOHgYD7x8PA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4WEhD6BgIA7gYCAO4GAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAgDsAAAAAgYAAPIGAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAgDuBgAA+wcDAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAPYGAADzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6GgoD6BgIA9gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4WEBD7BwMA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAAD6BgIA7gYAAPIGAgDuBgIA7AAAAAIGAAD6RkJA+8fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+kZCQPoGAAD6BgIA84eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAO4GAAD6RkJA+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+kZCQPoGAAD6BgIA7gYCAO8HAQDwAAAAAgYCAO4GAAD6hoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/wcDAPoGAAD6BgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA7AAAAAAAAAACBgAA8gYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6Oioj6JiIg9gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO4GAADyBgIA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/BwMA+gYAAPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/8/LyPuXkZD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAAAAAAAAAAAAgYAAPAAAAACBgIA94+LiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+wcDAPYGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPdHQ0D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA9gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgIA7gYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/oaCgPsHAQDzBwEA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7gYCAO4GAADyBgIA7oaCgPoGAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8PCwj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgAA8gYAAPMHAQDzBwEA8gYCAOwAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYCAO6GgID3j4uI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAgD2BgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYCAPMHAQDwAAAAAgYCAO8HAQDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8AAAAAAAAAACBgAA8wcBAPIGAADzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADzJyMg98fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgAA8wcBAPIGAADyBgIA7AAAAAAAAAACBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA84eBgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYCAO4GAgDvBwEA8gYAAPIGAgDsAAAAAgYCAO4GAgDvBwEA8wcBAPIGAgDuBgAA8gYCAOwAAAAAAAAAAAAAAAIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYAAPIGAADyBgAA8AAAAAMHAwD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgAA8gYCAO4GAAD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAgD2BgIA7gYCAOwAAAACBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAOwAAAACBgAA8gYAAPIGAADyBgIA7gYCAOwAAAAChoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPYGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAw8LCPoKBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDuBgIA7gYAAPMHAQDyBgIA7gYAAPoKBAT+BgAA/gYAAP4GAAD+BgAA+gYCAO4GAADyBgAA8AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPAAAAAAAAAAAgYAAPIGAADyBgIA7gYCAO/Py8j6BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAADzBwEA8gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO5OSkj6BgAA/gYAAP5OSkj6BgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADyBgIA7AAAAAIGAgDvBwEA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYAAPIGAAD6BgAA/gYAAP4WEBD6BgIA7gYCAO4GAADyBgAA8gYAAPIGAADwAAAAAgYCAOwAAAACBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8gYAAPIGAgDvh4OA+4eDgPoGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7",96:"gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDwAAAAAwcBAPMHAQDyBgIA8wcBAPIGAADyhoKA8gYAAPIGAADyBgAA8AAAAAIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAADzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPOXkZD7z8vI+4+LiPu3sbD6BgIA7wcBAPAAAAACBgAA8gYCAO4GAADyBgIA8gYCAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAO8HAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8oaCgPIGAgDyBgIA8wcBAPIGAgDyBgAA8wcBAPIGAgDvBwEA8wcBAPIGAgDyBgAA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAADzBwEA8wcBAPIGAgDvBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPYGAAD+BgAA/goEBP4KBAT+RkBA9gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYAAPAAAAACBgAA8AAAAAIGAgDuBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcDAPKGgoDyBgIA8oaCgPIGAgDyhoKA8gYCAOwAAAACBgAA8gYCAO4GAADyBgIA8wcBAPIGAADwAAAAAgYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8AAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAADyBgAA8paQkPoGAAD+BgAA/goEBP4GAAD/FxEQ+AAAAAAAAAACBgIA7gYAAPIGAgDsAAAAAAAAAAIGAgDuBgIA7gYAAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYAAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPKGgoDzBwEA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDyBgIA8gYCAPMHAQDzBwEA8AAAAAIGAgDuBgIA7gYAAPIGAADyhoKA8gYAAPMHAQDwAAAAAgYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAADyBgIA7gYCAOwAAAACBgIA7gYCAPMHAQDyBgAA8gYCAPIGAgDuBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPIGAADzBwEA8paSkPoGAAD+BgAA/goEBP4KBAT+hoKA+gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAAAAAAIGAgDuBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8oaCgPIGAgDyBgAA8gYCAO8HAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPMHAQDyhoKA8gYCAPMHAQDzBwEA8AAAAAAAAAACBgIA7wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAADBwEA8gYCAO8HAQDzBwEA8AAAAAIGAADyBgIA7gYCAOwAAAACBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgIA8wcBAPAAAAACBgIA7AAAAAIGAgDvBwEA85eTkPoGAAD+BgAA/gYAAP4GAAD/z8vI+gYAAPMHAQDyBgIA7gYAAPMHAQDyBgIA7gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYCAO8HAQDyBgIA8oaCgPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDsAAAAAwcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPKGgoDyBgIA8oaCgPIGAgDzBwEA8gYCAOwAAAADBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAgDyBgIA8AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDuBgIA8oaCgPIGAADyBgIA8AAAAAIGAADyBgIA8gYAAPIGAADyFhAQ+goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/iYgIPoGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAADyBgIA7gYCAO4GAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAADyBgIA7gYCAPIGAADyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADylpKQ+goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/k5KSPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADzBwEA8wcBAPKGgoDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwMA8oaCgPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA8gYCAO4GAgDsAAAAAgYAAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDvj4uI+goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/8/LyPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYCAO8HAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDzBwEA8oaCgPKGgoDyBgIA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA8gYCAO4GAgDuBgAA8wcBAPIGAgDyBgIA7gYAAPIGAADyBgAA8gYAAPAAAAACBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPKmoKD6BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4WEBD7BwEA8gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgIA8gYAAPIGAgDsAAAAAgYCAO4GAgDuBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgIA8oaCgPIGAgDyBgAA8gYAAPIGAgDyBgIA8oaCgPIGAgDyBgIA8gYCAO8HAQDyBgIA7gYCAOwAAAACBgIA7wcBAPIGAADyBgIA7wcBAPIGAgDuBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPLOysj6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP8PCwj6BgAA8AAAAAIGAgDvBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDsAAAAAgYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYCAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyhoKA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcDAPIGAgDyBgIA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO8HAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4GAADyBgIA8iYiIPYGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+JiIg9gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAgDsAAAAAgYAAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAADzBwEA8oaCgPoGAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+FhIQ+gYAAPIGAADyBgIA7AAAAAIGAADyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA7wcBAPIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8gYCAO4GAgDuBgIA7gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8AAAAAAAAAACBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgAA8gYCAOwAAAADBwEA8wcBAPMHAQDwAAAAAAAAAAIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADyBgIA7gYAAPAAAAAAAAAAAgYAAPAAAAACJiIg9goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD/z8vI+gYAAPYGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAOwAAAADBwEA8gYAAPIGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPMHAwDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAADwAAAAAgYAAPIGAgDsAAAAAgYAAPMHAQDyBgAA8gYCAOwAAAACBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8wcBAPAAAAAAAAAAAgYCAO4GAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7gYAAPMHAQDyDgoI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4KCPoGAADyBgAA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPKGgoDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDvBwEA8gYCAPAAAAAAAAAAAgYCAO4GAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDwAAAAAgYCAOwAAAACBgIA7AAAAAAAAAACBgIA8gYCAPJGQkD3j4uI+goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/8/LyPpGQED2BgAA8oaCgPIGAgDyBgIA8wcBAPIGAADyBgIA8gYCAPIGAADzBwEA8gYAAPIGAgDyBgIA7wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYCAPKGgoDzBwMA8gYCAPIGAADyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8wcBAPIGAgDuBgAA8gYCAO4GAgDsAAAAAgYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAO4GAADyBgIA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYCAPKWkpD6CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP4KBAT+CgQE/goEBP4WEhD7BwEA8gYCAO8HAQDyBgIA8gYAAPMHAQDzBwMA8wcBAPIGAADyBgIA7gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAwDzBwEA8gYCAPIGAADyhoKA8wcBAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgAA8gYAAPAAAAACBgIA7gYAAPIGAgDuBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP/Py8j6JiIg9wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAO4GAADzBwEA8gYCAOwAAAACBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8paSkPoKBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+zsrI+gYCAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYCAO8HAQDyBgIA8gYCAOwAAAADBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA8gYAAPIGAgDuBgIA7AAAAAIGAADzBwEA8oaCgPIGAgDzBwEA8gYCAO8HAQDyBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDylpCQ+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4SDAz+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/iYgIPoGAgDuBgIA7gYAAPIGAgDyBgAA8gYCAO4GAADyBgAA8AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDyBgIA8gYAAPIGAgDzBwEA8gYAAPMHAQDyhoKA8oaCgPIGAgDyBgAA8gYCAOwAAAADBwEA8gYCAPIGAgDzBwEA8gYCAO4GAADyBgAA8gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYCAPIGAADyBgAA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzj4uI+goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/gYAAP4GAAD+CgQE/4+LiPpGQED3BwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYAAPIGAgDvBwEA8gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8gYCAPIWEhD6BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP5OSkj6BgAA8wcBAPMHAQDyBgAA8gYCAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgIA8gYCAPIGAADyBgIA8oaCgPIGAgDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8oaCgPIGAADyBgAA8gYCAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8AAAAAMHAQDyBgIA82djYPYKBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+DggI/goEBP4GAAD+FhAQ+wcBAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDsAAAAAAAAAAAAAAAChoKA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDyBgAA8gYCAPMHAQDyBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDwAAAAAgYCAO4GAADyJiIg95eTkPoKBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD/j4uI+sbAwPYGAgDyhoKA8oaCgPMHAQDyBgAA8AAAAAIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8oaCgPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAIGAgDvBwEA8gYCAPIGAADyBgIA7gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyjoqI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPsHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAADyBgIA8wcBAPKGgoDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgAA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgAA8wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA8wcBAPIWEhD6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+XkZD6BgAA8gYCAO4GAgDyBgIA8gYCAO8HAQDyBgIA8gYAAPMHAQDyBgIA7gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPIGAADzBwEA8gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDsAAAAAwcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8jYwMPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgIA8gYCAO4GAADyhoKA8wcBAPIGAgDyBgIA8gYCAO4GAgDyBgIA8gYCAPIGAgDyBgAA8oaCgPIGAgDzBwEA8gYCAPKGgoDzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYCAO4GAADyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAADzBwEA8gYAAPIGAgDsAAAAAwcBAPIGAADyJiIg98/LyPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD/x8PA+kZCQPYGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPIGAgDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAO8HAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPKGgoDzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgDvBwEA8wcBAPMHAQDwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/4+LiPomIiD3BwEA8gYCAO4GAgDuBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDyBgIA7gYAAPMHAQDyBgIA8oaCgPMHAQDzBwEA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgIA8gYAAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDzBwEA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgIA7wcBAPIGAgDsAAAAAgYCAO4GAADzBwEA8kZCQPePi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP+Pi4j6BgIA9gYCAO4GAgDuhoKA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDwAAAAAgYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADyxsDA94+LiPoKBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/T0tI+gYAAPcHAQDyBgAA8gYCAPIGAgDsAAAAAgYCAO8HAQDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDyBgAA8gYCAPMHAQDyBgAA8gYCAO8HAQDwAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAOwAAAACBgAA8gYCAO4GAgDuBgAA8gYAAPJmYmD3V1NQ+gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/4+LiPqGgoD2BgIA8wcDAPIGAADyBgAA8gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA7gYCAPIGAgDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDyhoKA8oaCgPMHAQDzBwEA8gYCAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYCAO8HAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA7kZCQPeXk5D6CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4OCAj+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+BgAA/gYAAP+Pi4j6JiIg9gYAAPAAAAAAAAAAAwcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgIA7wcBAPIGAADyBgIA7gYAAPIGAgDzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADyRkJA95eTkPoKBAT+CgQE/g4ICP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD/j4uI+gYCAPYGAgDuBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDzBwEA8wcBAPKGgoDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA7AAAAAMHAQDzBwEA8gYCAO4GAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgIA7AAAAAIGAADyBgAA8oaCgPMHAQDyBgIA7gYCAO4mICD7z8vI+gYAAP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/8fDwPoWEBD6BgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcDAPKGgoDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgIA8wcBAPMHAQDyBgIA75eRkPoKBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgAA8wcBAPMHAwDyhoKA8gYCAPMHAQDwAAAAAgYCAO4GAgDyBgIA8gYAAPIGAADyBgIA7gYCAPIGAADyBgIA7wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8wcBAPIGAAD2xsLA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/o6KiPpGQkD3BwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADzBwEA8iYgIPuHg4D6BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP+Pi4j7R0NA9wcBAPIGAgDuBgIA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAOwAAAACBgAA8wcBAPMHAQDyBgIA7gYAAPIGAgDyhoKA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAAD2TkpI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/hYSEPsHAQDyBgAA8gYCAO4GAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYCAPKGgoDzBwEA8gYCAOwAAAADBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8iYgIPuPi4j6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Xk5D6pqCg+gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPIGAADyBgIA8wcBAPImIiD2zsrI+gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4ICP4KBAT+DggI/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/paSkPomIiD3BwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADzBwEA8wcDAPIGAgDzBwEA8gYCAPIGAgDuBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA9g4KCPvPy8j6CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+lpKQ+kZCQPYGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgAA8wcBAPIGAADyBgAA8kZAQPYWEhD7z8vI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/4+LiPoWEhD6ZmJg9gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA7AAAAAIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgD2FhIQ+8/LyPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/o6KiPomIiD2BgAA8gYCAPIGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAADyFhAQ+w8LCPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4SDAz+BgAA/g4ICP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+xsLA+paQkPsHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA+kZCQPvPy8j6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/g4ICP+Pi4j6joqI+kZAQPoGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPKGgID3FxEQ+o6KiPvPy8j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4OCAj+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP+Xk5D6lpKQ+rawsPpGQkD2BgAA86ehoPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/p6Gg+4+LiPoKBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT/z8vI+8/LyPoKBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT/l5OQ+6ehoPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT/t7Gw+wcBAPKmoqD2hoCA+paSkPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP/X09D6joqI+xcREPpGQED2BgAA8wcBAPIGAgDzBwEA8wcBAPIGAADyFhAQ+oaCgPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP/Py8j6VlJQ+iYgIPoGAgDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADylpCQ+tbS0PoGAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT/DwsI+iYgIPoGAgDyhoKA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgD2joqI+gYAAP4GAAD+BgAA/g4ICP4OCAj+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/z8vI+hYSEPpmYmD3BwEA8wcBAPMHAwDzBwMA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8kZCQPYWEhD7j4uI+goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/8/LyPoOCgj6RkBA9gYAAPIGAADyBgAA8gYCAPIGAgDyhoKA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgAA8gYCAPIGAADzBwEA8gYCAPKGgoDyBgIA8gYAAPMHAQDyhoKA8oaCgPIGAADzBwEA8gYAAPIGAgDyBgIA9o6KiPoKBAT+BgAA/gYAAP4KBAT+DggI/g4ICP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP/X09D6FhIQ+oaAgPYGAgDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgAA8gYAAPIGAADwAAAAAgYAAPImIiD2npqY+gYAAP4KBAT+DggI/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPpGQkD2BgIA8wcBAPMHAQDyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAgDuBgIA7gYCAO4GAADwAAAAAgYCAO8HAQDzBwEA8oaAgPuHg4D6BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP+Xk5D6JiAg+gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPKGgoDyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADyBgAA8AAAAAIGAADyDgoI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/lZSUPrGwMD3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDzBwEA8gYCAO8HAQDyBgIA7gYAAPIGAgDuBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDwAAAAAgYAAPAAAAACBgAA8gYCAO4GAgDsAAAAAwcDAPePi4j6CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP+Pi4j6JiAg+wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPKGgoDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgAA8AAAAAAAAAADBwEA8gYCAO4mIiD2joqI+goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/s7KyPqGgID3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA8gYAAPIGAgDuBgIA8hYSEPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/l5GQ+wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYAAPImICD7z8vI+goEBP4GAAD+CgQE/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/8fDwPomICD7BwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAADzBwEA8gYCAPMHAQDyZmJg94+LiPoGAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD/j4uI+iYiIPcHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8kZCQPePi4j6CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYAAPIGAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA8oaCgPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA8gYAAPIGAADyBgIA7gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYAAPMHAQDzBwEA8wcBAPJGQkD3j4uI+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4OCAj+CgQE/g4ICP4OCAj+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/09LSPpGQkD3BwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8oaCgPMHAQDyBgIA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyhoCA909LSPoKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT/j4uI+sbAwPYGAgDyBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDyhoKA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYAAPIGAgDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8mZiYPeXk5D6CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+DggI/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgIA7wcBAPMHAQDzBwEA8wcBAPJGQkD3j4uI+g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4GAAD+DggI/4+LiPpGQkD2BgAA8gYAAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyJiIg98/LyPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT/19PQ+kZCQPYGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPKGgoDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA7hYQEPoKBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4KBAT+NjAw+oaCgPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPKGgoDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8gYCAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYAAPOXkZD6BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCgj6BgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPKGgoDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAwDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDyhoKA8oaCgPKGgoDyBgIA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADyBgAA8gYCAO8HAQDyzsrI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPMHAQDyBgAA8gYCAO4GAADyBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDuhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPMHAQDwAAAAAwcBAPMHAQDyBgAA8gYCAPIGAgDyhoKA8oaCgPKGgoDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYAAPMHAQDyBgIA7gYAAPMHAQDyBgAA94eDgPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+kZCQPYGAADyBgIA7wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA7wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDvBwEA8gYAAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAPMHAQDyBgIA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT/R0NA9gYCAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPJOSkj6BgAA/gYAAP4KBAT+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4WEhD6BgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYAAPIGAgDyBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgAA8gYAAPMHAQDyBgIA7wcBAPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8oaCgPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAO5GQED3j4uI+gYAAP4OCAj+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/5eTkPoGAgDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDyhoKA8gYCAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA8gYAAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyJiAg+goEBP4KBAT+DggI/goEBP4OCAj+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/qagoPoGAADyBgAA8gYAAPIGAADyBgIA8gYCAPIGAADyBgIA8gYCAO8HAQDyBgAA8wcBAPIGAADyBgAA8gYCAPIGAADyBgIA7gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA7wcBAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDvBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADzBwEA8wcBAPAAAAACBgAA8gYCAO4GAADyBgIA7s7KyPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+lpKQ+gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA8wcBAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyBgAA8iYiIPfHw8D6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+JiIg9wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDyhoKA8wcBAPMHAQDyBgAA8gYCAPMHAQDyhoKA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDvBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIOCgj6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP6WkpD6BgIA8gYCAPIGAgDzBwEA8wcBAPKGgoDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgIA8wcBAPIGAgDyBgAA8gYCAPIGAADyBgAA8AAAAAIGAADyBgAA8wcBAPIGAADyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYCAPJGQED3z8vI+gYAAP4GAAD+DggI/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+CgQE/4+LiPpmYmD3BwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8gYAAPKGgoDzBwEA8gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8AAAAAMHAQDzBwEA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyDgoI+goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/g4KCPsHAQDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPKGgoDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAADyBgAA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAADyBgAA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8oaCgPIGAgDzBwEA8gYCAPIGAADyhoCA98/LyPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/mZiYPYGAADyBgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDvBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8hYSEPoKBAT+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+lpKQ+gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAgDuBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDzBwMA8wcBAPMHAQDzBwEA8AAAAAIGAADzBwEA8AAAAAIGAADyBgIA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPMHAQDyBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+RkJA9wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8wcBAPKGgoDzBwEA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgIA8gYAAPIGAADyBgIA7gYCAO4GAgDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDvBwEA8gYAAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDyBgAA8AAAAAIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMPCwj6BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP7Oysj6BgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8oaCgPKGgoDyBgIA8gYCAPIGAgDvBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDvBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAAD6BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP6WkJD7BwEA8wcBAPIGAADyBgAA8gYCAPKGgoDyBgIA7wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAgDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgIA8oaCgPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyhoKA8wcBAPMHAQDzz8vI+goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/4+LiPoGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDyBgAA8gYCAPIGAgDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADyBgAA8wcBAPAAAAADBwEA8wcBAPIGAgDuBgIA7gYAAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyVlJQ+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/paSkPoGAgDyBgIA8wcBAPMHAQDyhoKA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYCAPIGAADzBwEA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA8wcBAPIGAADwAAAAAgYAAPIGAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyJiAg+goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/iYgIPoGAADyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADyhoKA8gYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYAAPAAAAACBgAA8gYCAO4GAgDvBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDyhoKA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgAA8AAAAAIGAgDuBgIA8wcBAPAAAAACBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA8gYCAO8HAQDyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA88/LyPoGAAD+CgQE/goEBP4KBAT/j4uI+gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPKGgoDyBgIA8gYCAPIGAgDyBgIA7gYCAO8HAQDyBgAA8gYAAPIGAADyBgIA7gYAAPIGAgDsAAAAAAAAAAMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPKGgoDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgAA8paSkPoKBAT+CgQE/goEBP4KBAT+hoKA+gYAAPMHAQDyhoKA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgIA8oaCgPIGAADyBgAA8gYAAPMHAQDzBwEA8oaCgPIGAgDyBgIA7gYCAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPIGAADyhoKA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8gYAAPIGAgDyBgIA8wcBAPMHAQDwAAAAAgYCAO8HAQDyBgAA8gYCAOwAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8xcREPoKBAT+CgQE/goEBP4KBAT+pqCg+wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8kZAQPYGAAD+CgQE/goEBP4KBAT+JiIg9gYCAPIGAgDyBgIA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDyBgIA7gYAAPAAAAACBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPKGgoDyBgAA8wcBAPIGAADzBwEA8AAAAAIGAADyBgIA7gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPOXkZD7h4OA+8/LyPunoaD7BwEA8gYCAPIGAgDzBwEA8gYAAPIGAgDvBwEA8wcBAPIGAADyBgIA8wcBAPIGAADyBgIA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAPMHAQDyBgIA7gYAAPIGAADyBgAA8"},uA=new Map;function Lg(A){if(typeof Buffer<"u")return Uint8Array.from(Buffer.from(A,"base64"));if(typeof atob<"u"){let g=atob(A),B=new Uint8Array(g.length);for(let P=0;P<g.length;P++)B[P]=g.charCodeAt(P);return B}throw new Error("No base64 decoder available in current runtime")}function kA(A){let g=Number(A);if(!(g in LA))return null;if(!uA.has(g)){let B=Lg(LA[g]),P=bg[g],D=new Float32Array(B.buffer,B.byteOffset,P);uA.set(g,new Float32Array(D))}return new Float32Array(uA.get(g))}var kg=.011764705882352941,Fg=.002,jg=.99,Wg=255;function v(A,g,B,P={}){let{x:D,y:t,width:e,height:o}=B,G=Number.isFinite(P.alphaGain)&&P.alphaGain>0?P.alphaGain:1;for(let c=0;c<o;c++)for(let E=0;E<e;E++){let w=((t+c)*A.width+(D+E))*4,n=c*e+E,r=g[n];if(Math.max(0,r-kg)*G<Fg)continue;let Y=Math.min(r*G,jg),I=1-Y;for(let i=0;i<3;i++){let s=(A.data[w+i]-Y*Wg)/I;A.data[w+i]=Math.max(0,Math.min(255,Math.round(s)))}}}var Ug=Object.freeze({"0.5k":Object.freeze({logoSize:48,marginRight:32,marginBottom:32}),"1k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64}),"2k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64}),"4k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64})});function DA(A,g,B){return B.map(([P,D,t])=>({modelFamily:A,resolutionTier:g,aspectRatio:P,width:D,height:t}))}var FA=Object.freeze([...DA("gemini-3.x-image","0.5k",[["1:1",512,512],["1:4",256,1024],["1:8",192,1536],["2:3",424,632],["3:2",632,424],["3:4",448,600],["4:1",1024,256],["4:3",600,448],["4:5",464,576],["5:4",576,464],["8:1",1536,192],["9:16",384,688],["16:9",688,384],["21:9",792,168]]),...DA("gemini-3.x-image","1k",[["1:1",1024,1024],["1:4",512,2064],["1:8",352,2928],["2:3",848,1264],["3:2",1264,848],["3:4",896,1200],["4:1",2064,512],["4:3",1200,896],["4:5",928,1152],["5:4",1152,928],["8:1",2928,352],["9:16",768,1376],["16:9",1376,768],["16:9",1408,768],["21:9",1584,672]]),...DA("gemini-3.x-image","2k",[["1:1",2048,2048],["1:4",512,2048],["1:8",384,3072],["2:3",1696,2528],["3:2",2528,1696],["3:4",1792,2400],["4:1",2048,512],["4:3",2400,1792],["4:5",1856,2304],["5:4",2304,1856],["8:1",3072,384],["9:16",1536,2752],["16:9",2752,1536],["21:9",3168,1344]]),...DA("gemini-3.x-image","4k",[["1:1",4096,4096],["1:4",2048,8192],["1:8",1536,12288],["2:3",3392,5056],["3:2",5056,3392],["3:4",3584,4800],["4:1",8192,2048],["4:3",4800,3584],["4:5",3712,4608],["5:4",4608,3712],["8:1",12288,1536],["9:16",3072,5504],["16:9",5504,3072],["21:9",6336,2688]]),...DA("gemini-2.5-flash-image","1k",[["1:1",1024,1024],["2:3",832,1248],["3:2",1248,832],["3:4",864,1184],["4:3",1184,864],["4:5",896,1152],["5:4",1152,896],["9:16",768,1344],["16:9",1344,768],["21:9",1536,672]])]),Vg=new Map(FA.map(A=>[`${A.width}x${A.height}`,A]));function YA(A){let g=Number(A);if(!Number.isFinite(g))return null;let B=Math.round(g);return B>0?B:null}function Xg(A,g,B){return Math.max(g,Math.min(B,A))}function jA(A){return Ug[A.resolutionTier]??null}function Jg(A){return`${A.logoSize}:${A.marginRight}:${A.marginBottom}`}function yA(A,g){let B=YA(A),P=YA(g);return!B||!P?null:Vg.get(`${B}x${P}`)??null}function QA(A,g){let B=yA(A,g);return B?jA(B):null}function lA(A,g,{maxRelativeAspectRatioDelta:B=.02,maxScaleMismatchRatio:P=.12,minLogoSize:D=24,maxLogoSize:t=192,limit:e=3}={}){let o=YA(A),G=YA(g);if(!o||!G)return[];let c=QA(o,G);if(c)return[{...c}];let E=o/G,w=FA.map(a=>{let Y=jA(a);if(!Y)return null;let I=o/a.width,i=G/a.height,C=(I+i)/2,s=a.width/a.height,u=Math.abs(E-s)/s,Q=Math.abs(I-i)/Math.max(I,i);if(u>B||Q>P)return null;let H={logoSize:Xg(Math.round(Y.logoSize*C),D,t),marginRight:Math.max(8,Math.round(Y.marginRight*I)),marginBottom:Math.max(8,Math.round(Y.marginBottom*i))},T=o-H.marginRight-H.logoSize,f=G-H.marginBottom-H.logoSize;return T<0||f<0?null:{config:H,score:u*100+Q*20+Math.abs(Math.log2(Math.max(C,1e-6)))}}).filter(Boolean).sort((a,Y)=>a.score-Y.score),n=[],r=new Set;for(let a of w){let Y=`${a.config.logoSize}:${a.config.marginRight}:${a.config.marginBottom}`;if(!r.has(Y)&&(r.add(Y),n.push(a.config),n.length>=e))break}return n}function EA(A,g,B){let P=[];B&&P.push(B),P.push(...lA(A,g));let D=[],t=new Set;for(let e of P){if(!e)continue;let o=Jg(e);t.has(o)||(t.add(o),D.push(e))}return D}var Zg=.35,XA=1e-8,_=(A,g,B)=>Math.max(g,Math.min(B,A));function WA(A){let g=0;for(let D=0;D<A.length;D++)g+=A[D];let B=g/A.length,P=0;for(let D=0;D<A.length;D++){let t=A[D]-B;P+=t*t}return{mean:B,variance:P/A.length}}function aA(A,g){if(A.length!==g.length||A.length===0)return 0;let B=WA(A),P=WA(g),D=Math.sqrt(B.variance*P.variance)*A.length;if(D<XA)return 0;let t=0;for(let e=0;e<A.length;e++)t+=(A[e]-B.mean)*(g[e]-P.mean);return t/D}function UA(A,g,B,P,D){let t=new Float32Array(D*D);for(let e=0;e<D;e++){let o=(P+e)*g+B,G=e*D;for(let c=0;c<D;c++)t[G+c]=A[o+c]}return t}function JA(A,g){let{width:B,height:P,data:D}=A,t=g.size??Math.min(g.width,g.height);if(!t||t<=0)return new Float32Array(0);if(g.x<0||g.y<0||g.x+t>B||g.y+t>P)return new Float32Array(0);let e=new Float32Array(t*t);for(let o=0;o<t;o++)for(let G=0;G<t;G++){let c=((g.y+o)*B+(g.x+G))*4;e[o*t+G]=(.2126*D[c]+.7152*D[c+1]+.0722*D[c+2])/255}return e}function qg(A){let{width:g,height:B,data:P}=A,D=new Float32Array(g*B);for(let t=0;t<D.length;t++){let e=t*4;D[t]=(.2126*P[e]+.7152*P[e+1]+.0722*P[e+2])/255}return D}function rA(A,g,B){let P=new Float32Array(g*B);for(let D=1;D<B-1;D++)for(let t=1;t<g-1;t++){let e=D*g+t,o=-A[e-g-1]-2*A[e-1]-A[e+g-1]+A[e-g+1]+2*A[e+1]+A[e+g+1],G=-A[e-g-1]-2*A[e-g]-A[e-g+1]+A[e+g-1]+2*A[e+g]+A[e+g+1];P[e]=Math.sqrt(o*o+G*G)}return P}function VA(A,g,B,P,D){let t=0,e=0,o=0;for(let E=0;E<D;E++){let w=(P+E)*g+B;for(let n=0;n<D;n++){let r=A[w+n];t+=r,e+=r*r,o++}}if(o===0)return 0;let G=t/o,c=Math.max(0,e/o-G*G);return Math.sqrt(c)}function $g(A,g){return rA(A,g,g)}function MA({gray:A,grad:g,width:B,height:P},D,t,e){let{x:o,y:G,size:c}=e;if(o<0||G<0||o+c>B||G+c>P)return null;let E=UA(A,B,o,G,c),w=UA(g,B,o,G,c),n=aA(E,D),r=aA(w,t),a=0;if(G>8){let I=Math.max(0,G-c),i=Math.min(c,G-I);if(i>8){let C=VA(A,B,o,G,c),s=VA(A,B,o,I,i);s>XA&&(a=_(1-C/s,0,1))}}let Y=Math.max(0,n)*.5+Math.max(0,r)*.3+a*.2;return{confidence:_(Y,0,1),spatialScore:n,gradientScore:r,varianceScore:a}}function AB(A,g){let B=new Set;for(let P=A;P<=g;P+=8)B.add(P);return 48>=A&&48<=g&&B.add(48),96>=A&&96<=g&&B.add(96),[...B].sort((P,D)=>P-D)}function gB(A,g,B){return EA(A,g,B)}function HA(A,g,B){if(A.has(B))return A.get(B);let P=B===96?g:L(g,96,B),D=$g(P,B),t={alpha:P,grad:D};return A.set(B,t),t}function iA(A,g,{dx:B=0,dy:P=0,scale:D=1}={}){if(g<=0)return new Float32Array(0);if(!Number.isFinite(B)||!Number.isFinite(P)||!Number.isFinite(D)||D<=0)return new Float32Array(0);if(B===0&&P===0&&D===1)return new Float32Array(A);let t=(G,c)=>{let E=Math.floor(G),w=Math.floor(c),n=G-E,r=c-w,a=_(E,0,g-1),Y=_(w,0,g-1),I=_(E+1,0,g-1),i=_(w+1,0,g-1),C=A[Y*g+a],s=A[Y*g+I],u=A[i*g+a],Q=A[i*g+I],H=C+(s-C)*n,T=u+(Q-u)*n;return H+(T-H)*r},e=new Float32Array(g*g),o=(g-1)/2;for(let G=0;G<g;G++)for(let c=0;c<g;c++){let E=(c-o)/D+o+B,w=(G-o)/D+o+P;e[G*g+c]=t(E,w)}return e}function L(A,g,B){if(B<=0)return new Float32Array(0);if(g===B)return new Float32Array(A);let P=new Float32Array(B*B),D=(g-1)/Math.max(1,B-1);for(let t=0;t<B;t++){let e=t*D,o=Math.floor(e),G=Math.min(g-1,o+1),c=e-o;for(let E=0;E<B;E++){let w=E*D,n=Math.floor(w),r=Math.min(g-1,n+1),a=w-n,Y=A[o*g+n],I=A[o*g+r],i=A[G*g+n],C=A[G*g+r],s=Y+(I-Y)*a,u=i+(C-i)*a;P[t*B+E]=s+(u-s)*c}}return P}function S({imageData:A,alphaMap:g,region:B}){let P=JA(A,B);return P.length===0||P.length!==g.length?0:aA(P,g)}function x({imageData:A,alphaMap:g,region:B}){let P=JA(A,B);if(P.length===0||P.length!==g.length)return 0;let D=B.size??Math.min(B.width,B.height);if(!D||D<=2)return 0;let t=rA(P,D,D),e=rA(g,D,D);return aA(t,e)}function ZA({processedImageData:A,alphaMap:g,position:B,residualThreshold:P=.22,originalImageData:D=null,originalSpatialMismatchThreshold:t=0}){return!!(S({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width??B.size}})>=P||D&&S({imageData:D,alphaMap:g,region:{x:B.x,y:B.y,size:B.width??B.size}})<=t)}function qA({imageData:A,alpha96:g,defaultConfig:B,threshold:P=Zg}){let{width:D,height:t}=A,e=qg(A),o=rA(e,D,t),G={gray:e,grad:o,width:D,height:t},c=new Map,w=gB(D,t,B).map(l=>{let d=l.logoSize,M={size:d,x:D-l.marginRight-d,y:t-l.marginBottom-d};if(M.x<0||M.y<0||M.x+d>D||M.y+d>t)return null;let h=HA(c,g,d),K=MA(G,h.alpha,h.grad,M);return K?{...M,...K}:null}).filter(Boolean),n=w.reduce((l,d)=>!l||d.confidence>l.confidence?d:l,null);if(n&&n.confidence>=P+.08)return{found:!0,confidence:n.confidence,spatialScore:n.spatialScore,gradientScore:n.gradientScore,varianceScore:n.varianceScore,region:{x:n.x,y:n.y,size:n.size}};let r=B.logoSize,a=_(Math.round(r*.65),24,144),Y=_(Math.min(Math.round(r*2.8),Math.floor(Math.min(D,t)*.4)),a,192),I=AB(a,Y),i=Math.max(32,Math.round(r*.75)),C=_(B.marginRight-i,8,D-a-1),s=_(B.marginRight+i,C,D-a-1),u=_(B.marginBottom-i,8,t-a-1),Q=_(B.marginBottom+i,u,t-a-1),H=[],T=l=>{H.push(l),H.sort((d,M)=>M.adjustedScore-d.adjustedScore),H.length>5&&(H.length=5)};for(let l of w)T({size:l.size,x:l.x,y:l.y,adjustedScore:l.confidence*Math.min(1,Math.sqrt(l.size/96))});for(let l of I){let d=HA(c,g,l);for(let M=C;M<=s;M+=8){let h=D-M-l;if(!(h<0))for(let K=u;K<=Q;K+=8){let O=t-K-l;if(O<0)continue;let y=MA(G,d.alpha,d.grad,{x:h,y:O,size:l});if(!y)continue;let z=y.confidence*Math.min(1,Math.sqrt(l/96));z<.08||T({size:l,x:h,y:O,adjustedScore:z})}}}let f=n??{x:D-B.marginRight-B.logoSize,y:t-B.marginBottom-B.logoSize,size:B.logoSize,confidence:0,spatialScore:0,gradientScore:0,varianceScore:0};for(let l of H){let d=_(l.size-10,a,Y),M=_(l.size+10,a,Y);for(let h=d;h<=M;h+=2){let K=HA(c,g,h);for(let O=l.x-8;O<=l.x+8;O+=2)if(!(O<0||O+h>D))for(let y=l.y-8;y<=l.y+8;y+=2){if(y<0||y+h>t)continue;let z=MA(G,K.alpha,K.grad,{x:O,y,size:h});z&&z.confidence>f.confidence&&(f={x:O,y,size:h,...z})}}}return{found:f.confidence>=P,confidence:f.confidence,spatialScore:f.spatialScore,gradientScore:f.gradientScore,varianceScore:f.varianceScore,region:{x:f.x,y:f.y,size:f.size}}}var fA=5,$A=1,BB=.8,PB=1.5,DB=.5,tB=.2,oB=.12,eB=.35,GB=.01,nB=3;function tA(A){return typeof ImageData<"u"&&A instanceof ImageData?new ImageData(new Uint8ClampedArray(A.data),A.width,A.height):{width:A.width,height:A.height,data:new Uint8ClampedArray(A.data)}}function p(A,g){let B=0,P=0;for(let D=0;D<g.height;D++)for(let t=0;t<g.width;t++){let e=((g.y+D)*A.width+(g.x+t))*4,o=A.data[e],G=A.data[e+1],c=A.data[e+2];o<=fA&&G<=fA&&c<=fA&&B++,P++}return P>0?B/P:0}function TA(A,g){let B=0,P=0,D=0;for(let o=0;o<g.height;o++)for(let G=0;G<g.width;G++){let c=((g.y+o)*A.width+(g.x+G))*4,E=.2126*A.data[c]+.7152*A.data[c+1]+.0722*A.data[c+2];B+=E,P+=E*E,D++}let t=D>0?B/D:0,e=D>0?Math.max(0,P/D-t*t):0;return{meanLum:t,stdLum:Math.sqrt(e)}}function Ag(A,g){return TA(A,g)}function dA({imageData:A,position:g,alphaMap:B,minAlpha:P=oB,maxAlpha:D=eB,outsideAlphaMax:t=GB,outerMargin:e=nB}){let o=0,G=0,c=0,E=0,w=0,n=0;for(let s=-e;s<g.height+e;s++)for(let u=-e;u<g.width+e;u++){let Q=g.x+u,H=g.y+s;if(Q<0||H<0||Q>=A.width||H>=A.height)continue;let T=(H*A.width+Q)*4,f=.2126*A.data[T]+.7152*A.data[T+1]+.0722*A.data[T+2],l=s>=0&&u>=0&&s<g.height&&u<g.width,d=l?B[s*g.width+u]:0;if(l&&d>=P&&d<=D){o+=f,G+=f*f,c++;continue}(!l||d<=t)&&(E+=f,w+=f*f,n++)}let r=c>0?o/c:0,a=n>0?E/n:0,Y=c>0?Math.sqrt(Math.max(0,G/c-r*r)):0,I=n>0?Math.sqrt(Math.max(0,w/n-a*a)):0,i=r-a,C=i/Math.max(1,I);return{bandCount:c,outerCount:n,bandMeanLum:r,outerMeanLum:a,bandStdLum:Y,outerStdLum:I,deltaLum:i,positiveDeltaLum:Math.max(0,i),visibility:C}}function IB(A,g){let B=A.y-A.height;return B<0?null:{x:A.x,y:B,width:A.width,height:A.height}}function hA({originalImageData:A,referenceImageData:g,candidateImageData:B,position:P}){let D=B?TA(B,P):null;return zA({originalImageData:A,referenceImageData:g,candidateTextureStats:D,position:P})}function zA({originalImageData:A,referenceImageData:g,candidateTextureStats:B,position:P}){let D=g??A,t=D?IB(P,D):null,e=t?TA(D,t):null,o=e&&B?Math.max(0,e.meanLum-B.meanLum-$A)/Math.max(1,e.meanLum):0,G=e&&B?Math.max(0,e.stdLum*BB-B.stdLum)/Math.max(1,e.stdLum):0,c=e&&B?Math.max(0,e.meanLum-B.meanLum-$A)/Math.max(1,e.stdLum):0,E=o>0,w=G>0,n=E&&c>=PB,r=E&&w&&o>=DB&&G>=tB;return{referenceTextureStats:e,candidateTextureStats:B,darknessPenalty:o,flatnessPenalty:G,darknessVisibility:c,texturePenalty:o*2+G*2,tooDark:E,tooFlat:w,visibleDarkHole:n,hardReject:r||n}}function U(A,g,B){return{spatialScore:S({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),gradientScore:x({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}})}}var cB=4,YB=.25,EB=.05;function gg(A,g,B,P={}){let D=A&&typeof A=="object"&&"imageData"in A&&g===void 0,t=D?A.imageData:A,e=D?A.alphaMap:g,o=D?A.position:B,G=D?A:P,c=Math.max(1,G.maxPasses??cB),E=G.residualThreshold??YB,w=Math.max(0,G.startingPassIndex??0),n=Number.isFinite(G.alphaGain)&&G.alphaGain>0?G.alphaGain:1,r=tA(t),a=r,Y=p(r,o),I=Math.min(1,Y+EB),i=[],C="max-passes",s=w,u=w;for(let Q=0;Q<c;Q++){u=w+Q+1;let H=U(r,e,o),T=tA(r);v(T,e,o,{alphaGain:n});let f=U(T,e,o),l=p(T,o),d=Math.abs(H.spatialScore)-Math.abs(f.spatialScore),M=f.gradientScore-H.gradientScore,h=hA({referenceImageData:a,candidateImageData:T,position:o});if(l>I){C="safety-near-black";break}if(h.hardReject){C="safety-texture-collapse";break}if(r=T,s=w+Q+1,i.push({index:s,beforeSpatialScore:H.spatialScore,beforeGradientScore:H.gradientScore,afterSpatialScore:f.spatialScore,afterGradientScore:f.gradientScore,improvement:d,gradientDelta:M,nearBlackRatio:l}),Math.abs(f.spatialScore)<=E){C="residual-low";break}}return{imageData:r,passCount:s,attemptedPassCount:u,stopReason:C,passes:i}}function J(A){return typeof A=="number"&&Number.isFinite(A)?A:null}function Bg({spatialScore:A,gradientScore:g}){let B=J(A),P=J(g);return B===null||P===null?{tier:"insufficient"}:B>=.3&&P>=.12||B>=.295&&P>=.45?{tier:"direct-match"}:B>0||P>0?{tier:"needs-validation"}:{tier:"insufficient"}}function Pg(A){if(!A||A.found!==!0)return{tier:"insufficient"};let g=J(A.confidence),B=J(A.spatialScore),P=J(A.gradientScore),D=J(A?.region?.size);return g===null||B===null||P===null||D===null?{tier:"insufficient"}:g>=.5&&B>=.45&&P>=.12&&D>=40&&D<=192?{tier:"direct-match"}:D>=40&&D<=192&&P>=.12&&(g>0||B>0)?{tier:"needs-validation"}:{tier:"insufficient"}}function oA({spatialScore:A,gradientScore:g}){return Bg({spatialScore:A,gradientScore:g}).tier==="direct-match"}function eA(A){return Pg(A).tier==="direct-match"}var aB=.05,rB=.08,iB=.22,wB=.04,CB=.25,sB=.22,uB=.08,yB=.18,QB=.05,lB=.35,MB=.8,HB=.12,fB=.65,TB=.3,dB=.02,hB=.02,zB=.03,ag=[-.5,-.25,0,.25,.5],rg=[.99,1,1.01],Dg=[-12,-8,-4,0,4,8,12],OB=[-2,-1,0,1,2],pB=[-12,-10,-8,-6,-4,-2,2,4,6,8,10,12],tg=24,KB=1.05,mB=.55,og=16,eg=8,SB=2,Gg=2,ng=8,_B=.2,OA=[-1,0,1],RB=[-1,-.5,0,.5,1],NB=[.985,1,1.015],xB=.22,vB=.24,Ig=Object.freeze({x:0,y:0});function wA(...A){let g={};for(let B of A)!B||typeof B!="object"||Object.assign(g,B);return Object.keys(g).length>0?g:null}function cg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:e=null,includeCatalogVariants:o=!0}){let G=o?EA(A.width,A.height,g):[g],c=[];for(let E of G){let w=E===g?B:{x:A.width-E.marginRight-E.logoSize,y:A.height-E.marginBottom-E.logoSize,width:E.logoSize,height:E.logoSize};if(w.x<0||w.y<0||w.x+w.width>A.width||w.y+w.height>A.height)continue;let n=typeof e=="function"?e(E.logoSize):nA(E.logoSize,{alpha48:P,alpha96:D,getAlphaMap:t});n&&c.push({config:E,position:w,alphaMap:n,source:E===g?"standard":"standard+catalog",provenance:E===g?null:{catalogVariant:!0}})}return c}function pA(A,{directMatch:g=!1}={}){return A?g?"direct-match":A.source?.includes("validated")||A.accepted?"validated-match":"safe-removal":"insufficient"}function GA(A){return A?Math.abs(A.processedSpatialScore)>sB||Math.max(0,A.processedGradientScore)>uB:!0}function bB(A,g){return A?Number(A.position?.width)>=72&&Number(g?.height)>Number(g?.width)*1.25&&(Math.abs(A.processedSpatialScore)>yB||Math.max(0,A.processedGradientScore)>QB):!0}function nA(A,{alpha48:g,alpha96:B,getAlphaMap:P}={}){if(A===48)return g;if(A===96)return B;let D=typeof P=="function"?P(A):null;return D||(B?L(B,96,A):null)}function LB({alpha48:A,alpha96:g,getAlphaMap:B}){let P=new Map;return D=>{if(P.has(D))return P.get(D);let t=nA(D,{alpha48:A,alpha96:g,getAlphaMap:B});return P.set(D,t),t}}function kB(A){return A?Math.abs(A.processedSpatialScore)>xB||Math.max(0,A.processedGradientScore)>vB:!0}function b({originalImageData:A,alphaMap:g,position:B,source:P,config:D,baselineNearBlackRatio:t,adaptiveConfidence:e=null,alphaGain:o=1,provenance:G=null,includeImageData:c=!0}){if(!g||!B)return null;let E=U(A,g,B),w=jB({originalImageData:A,alphaMap:g,position:B,alphaGain:o}),n={x:Ig.x,y:Ig.y,width:B.width,height:B.height},r=U(w,g,n),a=p(w,n),Y=a-t,I=E.spatialScore-r.spatialScore,i=r.gradientScore-E.gradientScore,C=zA({originalImageData:A,referenceImageData:A,candidateTextureStats:Ag(w,n),position:B}),s=C.texturePenalty;return{accepted:C.hardReject!==!0&&Y<=aB&&I>=rB&&(Math.abs(r.spatialScore)<=iB||i<=wB),source:P,config:D,position:B,alphaMap:g,adaptiveConfidence:e,alphaGain:o,provenance:wA(G),imageData:c?ig(A,g,B,o):null,originalSpatialScore:E.spatialScore,originalGradientScore:E.gradientScore,processedSpatialScore:r.spatialScore,processedGradientScore:r.gradientScore,improvement:I,nearBlackRatio:a,nearBlackIncrease:Y,gradientIncrease:i,tooDark:C.tooDark,tooFlat:C.tooFlat,hardReject:C.hardReject,texturePenalty:s,validationCost:Math.abs(r.spatialScore)+Math.max(0,r.gradientScore)*.6+Math.max(0,Y)*3+s}}function FB(A){let g=A.filter(B=>B?.accepted);return g.length===0?null:(g.sort((B,P)=>B.validationCost!==P.validationCost?B.validationCost-P.validationCost:P.improvement-B.improvement),g[0])}function jB({originalImageData:A,alphaMap:g,position:B,alphaGain:P}){let D={width:B.width,height:B.height,data:new Uint8ClampedArray(B.width*B.height*4)};for(let t=0;t<B.height;t++){let e=((B.y+t)*A.width+B.x)*4,o=e+B.width*4,G=t*B.width*4;D.data.set(A.data.subarray(e,o),G)}return v(D,g,{x:0,y:0,width:B.width,height:B.height},{alphaGain:P}),D}function ig(A,g,B,P){let D=tA(A);return v(D,g,B,{alphaGain:P}),D}function q(A,g){return!A||A.imageData?A:{...A,imageData:ig(g,A.alphaMap,A.position,A.alphaGain??1)}}function k(A,g,B=.005){return g?.accepted?A?ZB(A,g)?A:Yg(A,g)?g:Yg(g,A)?A:g.validationCost<A.validationCost-B||Math.abs(g.validationCost-A.validationCost)<=B&&g.improvement>A.improvement+.01?g:A:g:A}function $(A){return typeof A?.source=="string"&&A.source.startsWith("standard")}function WB(A){return $(A)&&(A?.provenance?.localShift===!0||A?.provenance?.sizeJitter===!0||String(A?.source||"").includes("+warp"))}function UB(A){return $(A)&&A?.provenance?.localShift!==!0&&A?.provenance?.sizeJitter!==!0}function VB(A){let g=Number(A?.originalSpatialScore),B=Number(A?.originalGradientScore);return!Number.isFinite(g)||!Number.isFinite(B)?!1:B>=lB||g>=MB}function XB(A){let g=Number(A?.originalSpatialScore),B=Number(A?.originalGradientScore);return!Number.isFinite(g)||!Number.isFinite(B)?!1:B<HB||g<fB}function JB(A,g){let B=Number(A?.processedGradientScore),P=Number(g?.processedGradientScore);return!Number.isFinite(B)||!Number.isFinite(P)?!1:Math.max(0,B)<=hB&&Math.max(0,P)>=zB}function KA(A,g){if(!UB(A)||!WB(g))return!1;let B=Number(A.validationCost)-Number(g.validationCost);return Number.isFinite(B)?VB(A)&&XB(g)&&B<TB||JB(A,g):!1}function ZB(A,g){return A?.provenance?.localShift===!0||!$(g)?!1:KA(A,g)}function qB(A,g){return A?.provenance?.localShift!==!0||!$(A)||!$(g)||!g?.accepted?!1:KA(g,A)}function wg(A){return A?Math.max(0,Number(A.processedGradientScore))<=dB:!1}function $B(A,g){if(!g||g.logoSize!==48)return!1;let B=Number(A?.width),P=Number(A?.height);return!Number.isFinite(B)||!Number.isFinite(P)||B<384||B>1536||P<384||P>1536||Math.max(B,P)<512?!1:yA(B,P)===null}function Yg(A,g){if(g?.provenance?.previewAnchor!==!0||!A||A?.provenance?.previewAnchor===!0)return!1;let B=Number(A.originalSpatialScore),P=Number(A.originalGradientScore),D=Number(g.originalSpatialScore),t=Number(g.originalGradientScore);if(!Number.isFinite(B)||!Number.isFinite(P)||!Number.isFinite(D)||!Number.isFinite(t))return!1;let e=oA({spatialScore:B,gradientScore:P});return oA({spatialScore:D,gradientScore:t})&&!e?!0:t>=P+.2&&D>=B+.05}function AP({originalImageData:A,alphaMap:g,position:B,baselineSpatialScore:P,baselineGradientScore:D,shiftCandidates:t=ag,scaleCandidates:e=rg}){let o=B.width;if(!o||o<=8)return null;let G={spatialScore:P,gradientScore:D,shift:{dx:0,dy:0,scale:1},alphaMap:g};for(let w of e)for(let n of t)for(let r of t){if(r===0&&n===0&&w===1)continue;let a=iA(g,o,{dx:r,dy:n,scale:w}),Y=S({imageData:A,alphaMap:a,region:{x:B.x,y:B.y,size:o}}),I=x({imageData:A,alphaMap:a,region:{x:B.x,y:B.y,size:o}}),i=Math.max(0,Y)*.7+Math.max(0,I)*.3,C=Math.max(0,G.spatialScore)*.7+Math.max(0,G.gradientScore)*.3;i>C+.01&&(G={spatialScore:Y,gradientScore:I,shift:{dx:r,dy:n,scale:w},alphaMap:a})}let c=G.spatialScore>=P+.01,E=G.gradientScore>=D+.01;return c||E?G:null}function gP({originalImageData:A,candidateSeeds:g,adaptiveConfidence:B=null}){if(!Array.isArray(g)||g.length===0)return null;let P=null;for(let D of g)if(!wg(D))for(let t of Dg)for(let e of Dg){if(e===0&&t===0)continue;let o={x:D.position.x+e,y:D.position.y+t,width:D.position.width,height:D.position.height};if(o.x<0||o.y<0||o.x+o.width>A.width||o.y+o.height>A.height)continue;let G=b({originalImageData:A,alphaMap:D.alphaMap,position:o,source:`${D.source}+local`,config:D.config,baselineNearBlackRatio:p(A,o),adaptiveConfidence:B,provenance:wA(D.provenance,{localShift:!0}),includeImageData:!1});G?.accepted&&(P=k(P,G,.002))}return P}function BP({originalImageData:A,candidateSeeds:g,alpha48:B,alpha96:P,getAlphaMap:D,resolveAlphaMap:t=null,adaptiveConfidence:e=null}){if(!Array.isArray(g)||g.length===0)return null;let o=null;for(let G of g)for(let c of pB){let E=G.position.width+c;if(E<=24||E===G.position.width)continue;let w={x:A.width-G.config.marginRight-E,y:A.height-G.config.marginBottom-E,width:E,height:E};if(w.x<0||w.y<0||w.x+w.width>A.width||w.y+w.height>A.height)continue;let n=typeof t=="function"?t(E):nA(E,{alpha48:B,alpha96:P,getAlphaMap:D});if(!n)continue;let r=b({originalImageData:A,alphaMap:n,position:w,source:`${G.source}+size`,config:{logoSize:E,marginRight:G.config.marginRight,marginBottom:G.config.marginBottom},baselineNearBlackRatio:p(A,w),adaptiveConfidence:e,provenance:wA(G.provenance,{sizeJitter:!0}),includeImageData:!1});r?.accepted&&(o=k(o,r,.002))}return o}function PP({originalImageData:A,seedCandidate:g,adaptiveConfidence:B=null,shiftCandidates:P=OB}){if(!g?.alphaMap||!g?.position||wg(g))return null;let D=null;for(let t of P)for(let e of P){if(e===0&&t===0)continue;let o={x:g.position.x+e,y:g.position.y+t,width:g.position.width,height:g.position.height};if(o.x<0||o.y<0||o.x+o.width>A.width||o.y+o.height>A.height)continue;let G=b({originalImageData:A,alphaMap:g.alphaMap,position:o,source:`${g.source}+local`,config:g.config,baselineNearBlackRatio:p(A,o),adaptiveConfidence:B,provenance:wA(g.provenance,{localShift:!0}),includeImageData:!1});G?.accepted&&(D=k(D,G,.002))}return D}function DP({originalImageData:A,seedCandidate:g,adaptiveConfidence:B=null,alphaGainCandidates:P=[]}){if(!g?.alphaMap||!g?.position)return null;let D=null;for(let t of P){if(!Number.isFinite(t)||t<=1)continue;let e=b({originalImageData:A,alphaMap:g.alphaMap,position:g.position,source:`${g.source}+gain`,config:g.config,baselineNearBlackRatio:p(A,g.position),adaptiveConfidence:B,alphaGain:t,provenance:g.provenance,includeImageData:!1});e?.accepted&&(D=k(D,e,.002))}return D}function tP(A,g){A.push(g),A.sort((B,P)=>P.coarseScore-B.coarseScore),A.length>ng&&(A.length=ng)}function oP({originalImageData:A,config:g,alpha48:B,alpha96:P,getAlphaMap:D,resolveAlphaMap:t=null,adaptiveConfidence:e=null}){if(!$B(A,g))return null;let o=Math.max(tg,Math.round(g.logoSize*mB)),G=Math.max(o,Math.round(g.logoSize*KB)),c=Math.max(8,g.marginRight-og),E=g.marginRight+eg,w=Math.max(8,g.marginBottom-og),n=g.marginBottom+eg,r=[];for(let Y=o;Y<=G;Y+=SB){let I=typeof t=="function"?t(Y):nA(Y,{alpha48:B,alpha96:P,getAlphaMap:D});if(I)for(let i=c;i<=E;i+=Gg){let C=A.width-i-Y;if(!(C<0||C+Y>A.width))for(let s=w;s<=n;s+=Gg){let u=A.height-s-Y;if(u<0||u+Y>A.height)continue;let Q=S({imageData:A,alphaMap:I,region:{x:C,y:u,size:Y}}),H=x({imageData:A,alphaMap:I,region:{x:C,y:u,size:Y}}),T=Math.max(0,H)*.6+Math.max(0,Q)*.4;T<_B||tP(r,{coarseScore:T,alphaMap:I,position:{x:C,y:u,width:Y,height:Y},config:{logoSize:Y,marginRight:i,marginBottom:s}})}}}let a=null;for(let Y of r)for(let I of OA){let i=Y.position.width+I;if(i<tg)continue;let C=typeof t=="function"?t(i):nA(i,{alpha48:B,alpha96:P,getAlphaMap:D});if(C)for(let s of OA)for(let u of OA){let Q={x:Y.position.x+s,y:Y.position.y+u,width:i,height:i};if(Q.x<0||Q.y<0||Q.x+Q.width>A.width||Q.y+Q.height>A.height)continue;let H={logoSize:i,marginRight:A.width-Q.x-i,marginBottom:A.height-Q.y-i},T=b({originalImageData:A,alphaMap:C,position:Q,source:"standard+preview-anchor",config:H,baselineNearBlackRatio:p(A,Q),adaptiveConfidence:e,provenance:{previewAnchor:!0,previewAnchorLocalRefine:I!==0||s!==0||u!==0},includeImageData:!1});T?.accepted&&(a=k(a,T,.002))}}return a}function Eg({originalImageData:A,candidateSeeds:g}){let B=g.map(o=>b({originalImageData:A,alphaMap:o.alphaMap,position:o.position,source:o.source,config:o.config,baselineNearBlackRatio:p(A,o.position),provenance:o.provenance,includeImageData:!1})).filter(Boolean),P=B.find(o=>o.source==="standard")??B[0]??null,D=P?.originalSpatialScore??null,t=P?.originalGradientScore??null,e=oA({spatialScore:D,gradientScore:t});return{standardTrials:B,standardTrial:P,standardSpatialScore:D,standardGradientScore:t,hasReliableStandardMatch:e}}function eP({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:e}){let o=cg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:e,includeCatalogVariants:!1}),G=Eg({originalImageData:A,candidateSeeds:o});return!G.hasReliableStandardMatch&&(!G.standardTrial||GA(G.standardTrial))&&(o=cg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:e,includeCatalogVariants:!0}),G=Eg({originalImageData:A,candidateSeeds:o})),{standardCandidateSeeds:o,...G}}function GP(A,{reliableMatch:g=!1}={}){return A?.accepted?g?{candidate:A,decisionTier:"direct-match"}:{candidate:{...A,source:`${A.source}+validated`},decisionTier:"validated-match"}:null}function Z(A,g,B,{reliableMatch:P=!1,minCostDelta:D=.002}={}){let t=GP(B,{reliableMatch:P});if(!t)return{baseCandidate:A,baseDecisionTier:g};if(KA(A,t.candidate))return{baseCandidate:A,baseDecisionTier:g};let e=A,o=k(A,t.candidate,D);return{baseCandidate:o,baseDecisionTier:o!==e?t.decisionTier:g}}function nP({originalImageData:A,config:g,alpha96:B,resolveAlphaMap:P,allowAdaptiveSearch:D}){if(!D||!B)return{adaptive:null,adaptiveConfidence:null,adaptiveTrial:null};let t=qA({imageData:A,alpha96:B,defaultConfig:g}),e=t?.confidence??null;if(!t?.region||!(eA(t)||t.confidence>=CB))return{adaptive:t,adaptiveConfidence:e,adaptiveTrial:null};let o=t.region.size,G={x:t.region.x,y:t.region.y,width:o,height:o},c=P(o);if(!c)throw new Error(`Missing alpha map for adaptive size ${o}`);let E={logoSize:o,marginRight:A.width-G.x-o,marginBottom:A.height-G.y-o};return{adaptive:t,adaptiveConfidence:e,adaptiveTrial:b({originalImageData:A,alphaMap:c,position:G,source:"adaptive",config:E,baselineNearBlackRatio:p(A,G),adaptiveConfidence:t.confidence,provenance:{adaptive:!0},includeImageData:!1})}}function IP({originalImageData:A,baseCandidate:g,baseDecisionTier:B,adaptiveConfidence:P,alphaGainCandidates:D}){let t=q(g,A),e=g.alphaMap,o=g.position,G=g.config,c=g.source,E=B||pA(g),w=null,n=g.alphaGain??1,r=AP({originalImageData:A,alphaMap:e,position:o,baselineSpatialScore:t.originalSpatialScore,baselineGradientScore:t.originalGradientScore,shiftCandidates:t.provenance?.previewAnchor===!0?RB:ag,scaleCandidates:t.provenance?.previewAnchor===!0?NB:rg});if(r){let I=b({originalImageData:A,alphaMap:r.alphaMap,position:o,source:`${c}+warp`,config:G,baselineNearBlackRatio:p(A,o),adaptiveConfidence:P,provenance:t.provenance,includeImageData:!1}),i=k(t,I);i!==t&&(e=I.alphaMap,c=i.source,t=q(i,A),w=r.shift,E=pA(i,{directMatch:E==="direct-match"}))}let a=t.provenance?.previewAnchor===!0?kB(t):GA(t),Y=t;if(a)for(let I of D){let i=b({originalImageData:A,alphaMap:e,position:o,source:`${c}+gain`,config:G,baselineNearBlackRatio:p(A,o),adaptiveConfidence:P,alphaGain:I,provenance:t.provenance,includeImageData:!1});Y=k(Y,i)}return Y!==t&&(t=q(Y,A),c=Y.source,n=Y.alphaGain,E=pA(Y,{directMatch:E==="direct-match"})),{selectedTrial:q(t,A),source:c,alphaMap:e,position:o,config:G,templateWarp:w,alphaGain:n,decisionTier:E}}function Cg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,allowAdaptiveSearch:e,alphaGainCandidates:o}){let G=LB({alpha48:P,alpha96:D,getAlphaMap:t}),c=g.logoSize===96?D:P,{standardCandidateSeeds:E,standardTrials:w,standardTrial:n,standardSpatialScore:r,standardGradientScore:a,hasReliableStandardMatch:Y}=eP({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:G}),I=null,i="insufficient";if(Y&&n?.accepted?(I=n,i="direct-match"):n?.accepted&&(I={...n,source:`${n.source}+validated`},i="validated-match"),!I&&n&&Y){let z=DP({originalImageData:A,seedCandidate:{...n,source:"standard+validated"},adaptiveConfidence:null,alphaGainCandidates:o});z&&(I=z,i="validated-match")}let C=null,s=null,u=null;for(let y of w)!y||y===n||({baseCandidate:I,baseDecisionTier:i}=Z(I,i,y,{reliableMatch:oA({spatialScore:y.originalSpatialScore,gradientScore:y.originalGradientScore})}));let Q=oP({originalImageData:A,config:g,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:G,adaptiveConfidence:s});if(Q&&({baseCandidate:I,baseDecisionTier:i}=Z(I,i,Q)),i!=="direct-match"&&!I?.provenance?.previewAnchor&&GA(I)){let y=BP({originalImageData:A,candidateSeeds:E,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:G});y&&({baseCandidate:I,baseDecisionTier:i}=Z(I,i,y))}if(i!=="direct-match"&&I?.provenance?.sizeJitter===!0&&!I?.provenance?.previewAnchor&&$(I)&&GA(I)){let y=PP({originalImageData:A,seedCandidate:I,adaptiveConfidence:s});y&&({baseCandidate:I,baseDecisionTier:i}=Z(I,i,y))}if((!e||!D?!1:I?GA(I)?(I=q(I,A),ZA({processedImageData:I.imageData,alphaMap:I.alphaMap,position:I.position,originalImageData:A,originalSpatialMismatchThreshold:0})):!1:!0)&&({adaptive:C,adaptiveConfidence:s,adaptiveTrial:u}=nP({originalImageData:A,config:g,alpha96:D,resolveAlphaMap:G,allowAdaptiveSearch:e})),u&&({baseCandidate:I,baseDecisionTier:i}=Z(I,i,u,{reliableMatch:eA(C)})),!I?.provenance?.previewAnchor&&!eA(C)&&bB(I,A)){let y=gP({originalImageData:A,candidateSeeds:E,adaptiveConfidence:s});y&&({baseCandidate:I,baseDecisionTier:i}=Z(I,i,y))}if(I||(Y&&n?(I=n,i="direct-match"):eA(C)&&u&&(I=u,i="direct-match")),!I){let y=FB([n,u]);if(!y)return{selectedTrial:null,source:"skipped",alphaMap:c,position:B,config:g,adaptiveConfidence:s,standardSpatialScore:r,standardGradientScore:a,templateWarp:null,alphaGain:1,decisionTier:"insufficient"};I={...y,source:`${y.source}+validated`},i="validated-match"}qB(I,n)&&(I=n,i=Y?"direct-match":"validated-match");let{selectedTrial:T,source:f,alphaMap:l,position:d,config:M,templateWarp:h,alphaGain:K,decisionTier:O}=IP({originalImageData:A,baseCandidate:I,baseDecisionTier:i,adaptiveConfidence:s,alphaGainCandidates:o});return{selectedTrial:q(T,A),source:f,alphaMap:l,position:d,config:M,adaptiveConfidence:s,standardSpatialScore:r,standardGradientScore:a,templateWarp:h,alphaGain:K,decisionTier:O}}function sg(A){if(!A||typeof A!="object")return null;let{logoSize:g,marginRight:B,marginBottom:P}=A;return[g,B,P].every(Number.isFinite)?{logoSize:g,marginRight:B,marginBottom:P}:null}function ug(A){if(!A||typeof A!="object")return null;let{x:g,y:B,width:P,height:D}=A;return[g,B,P,D].every(Number.isFinite)?{x:g,y:B,width:P,height:D}:null}function yg({selectedTrial:A,selectionSource:g=null,initialConfig:B=null,initialPosition:P=null}={}){return A?{candidateSource:typeof g=="string"&&g?g:typeof A.source=="string"?A.source:null,initialConfig:sg(B),initialPosition:ug(P),finalConfig:sg(A.config),finalPosition:ug(A.position),texturePenalty:Number.isFinite(A.texturePenalty)?A.texturePenalty:null,tooDark:A.tooDark===!0,tooFlat:A.tooFlat===!0,hardReject:A.hardReject===!0,usedCatalogVariant:A.provenance?.catalogVariant===!0,usedSizeJitter:A.provenance?.sizeJitter===!0,usedLocalShift:A.provenance?.localShift===!0,usedAdaptive:A.provenance?.adaptive===!0,usedPreviewAnchor:A.provenance?.previewAnchor===!0}:null}function CA(A,g){let B=QA(A,g);return B?{...B}:A>1024&&g>1024?{logoSize:96,marginRight:64,marginBottom:64}:{logoSize:48,marginRight:32,marginBottom:32}}function AA(A,g,B){let{logoSize:P,marginRight:D,marginBottom:t}=B;return{x:A-D-P,y:g-t-P,width:P,height:P}}function mA(A){return A===96?{logoSize:96,marginRight:64,marginBottom:64}:{logoSize:48,marginRight:32,marginBottom:32}}function cP(A,g,B){return A?A.logoSize===48?g:A.logoSize===96?B:B?L(B,96,A.logoSize):null:null}function YP(A,g){return g.x>=0&&g.y>=0&&g.x+g.width<=A.width&&g.y+g.height<=A.height}function Qg({imageData:A,defaultConfig:g,alpha48:B,alpha96:P,minSwitchScore:D=.25,minScoreDelta:t=.08}){if(!A||!g||!B||!P)return g;let e=mA(48),o=g.logoSize===96?mA(96):e,G=g.logoSize===96?e:mA(96),c=[o,G];for(let n of lA(A.width,A.height,{limit:1}))c.some(r=>r.logoSize===n.logoSize&&r.marginRight===n.marginRight&&r.marginBottom===n.marginBottom)||c.push(n);let E=null,w=Number.NEGATIVE_INFINITY;for(let n of c){let r=AA(A.width,A.height,n);if(!YP(A,r))continue;let a=cP(n,B,P);if(!a)continue;let Y=S({imageData:A,alphaMap:a,region:{x:r.x,y:r.y,size:r.width}});if(!E){E=n,w=Y;continue}Y>=D&&Y>w+t&&(E=n,w=Y)}return E??g}var EP=.5,aP=.18,rP=.18,_A=.05,iP=.42,Hg=1.2,fg=[-.25,0,.25],Tg=[.99,1,1.01],dg=[1.05,1.12,1.2,1.28,1.36,1.45,1.52,1.6,1.7,1.85,2,2.2,2.4,2.6],hg=40,wP=.08,CP=.1,sP=.03,uP=.04,yP=3,QP=.16,lP=.005,MP=.01,HP=.02,fP=1.5,SA=4,TP=.18,lg=Object.freeze([{minAlpha:.02,maxAlpha:.45,radius:2,strength:.7,outsideAlphaMax:.05},{minAlpha:.05,maxAlpha:.55,radius:3,strength:.7,outsideAlphaMax:.08},{minAlpha:.1,maxAlpha:.7,radius:3,strength:.8,outsideAlphaMax:.12},{minAlpha:.01,maxAlpha:.35,radius:4,strength:1.4,outsideAlphaMax:.05}]),dP=.45,hP=Object.freeze([{minAlpha:.01,maxAlpha:.55,radius:2,strength:1.3,outsideAlphaMax:.05,minGradientImprovement:.12,maxSpatialDrift:.18,maxAcceptedSpatial:.18}]),zP=.08,OP=.2;function m(){return typeof globalThis.performance?.now=="function"?globalThis.performance.now():Date.now()}function IA(A){return typeof ImageData<"u"&&A instanceof ImageData?new ImageData(new Uint8ClampedArray(A.data),A.width,A.height):{width:A.width,height:A.height,data:new Uint8ClampedArray(A.data)}}function pP(A){if(!A)return null;let{x:g,y:B,width:P,height:D}=A;return[g,B,P,D].every(t=>Number.isFinite(t))?{x:g,y:B,width:P,height:D}:null}function KP(A){if(!A)return null;let{logoSize:g,marginRight:B,marginBottom:P}=A;return[g,B,P].every(D=>Number.isFinite(D))?{logoSize:g,marginRight:B,marginBottom:P}:null}function Mg({position:A=null,config:g=null,adaptiveConfidence:B=null,originalSpatialScore:P=null,originalGradientScore:D=null,processedSpatialScore:t=null,processedGradientScore:e=null,suppressionGain:o=null,templateWarp:G=null,alphaGain:c=1,passCount:E=0,attemptedPassCount:w=0,passStopReason:n=null,passes:r=null,source:a="standard",decisionTier:Y=null,applied:I=!0,skipReason:i=null,subpixelShift:C=null,selectionDebug:s=null}={}){let u=pP(A);return{applied:I,skipReason:I?null:i,size:u?u.width:null,position:u,config:KP(g),detection:{adaptiveConfidence:B,originalSpatialScore:P,originalGradientScore:D,processedSpatialScore:t,processedGradientScore:e,suppressionGain:o},templateWarp:G??null,alphaGain:c,passCount:E,attemptedPassCount:w,passStopReason:n,passes:Array.isArray(r)?r:null,source:a,decisionTier:Y,subpixelShift:C??null,selectionDebug:s}}function mP({originalScore:A,processedScore:g,suppressionGain:B}){return A>=.6&&g>=EP&&B<=aP}function SP({originalSpatialScore:A,originalGradientScore:g,firstPassSpatialScore:B,firstPassGradientScore:P}){return Math.abs(B)<=.25?!0:A>=0&&B<0&&P<=zP&&g-P>=OP}function _P({sourceImageData:A,alphaMap:g,position:B,alphaGain:P,originalNearBlackRatio:D,baselineSpatialScore:t,baselineGradientScore:e,baselineShift:o,minGain:G=Hg,shiftCandidates:c=fg,scaleCandidates:E=Tg,minGradientImprovement:w=.04,maxSpatialDrift:n=.08}){let r=B.width;if(!r||r<=8||P<G)return null;let a=Math.min(1,D+_A),Y=[P],I=Math.max(1,Number((P-.01).toFixed(2))),i=Number((P+.01).toFixed(2));I!==P&&Y.push(I),i!==P&&Y.push(i);let C=o?.dx??0,s=o?.dy??0,u=o?.scale??1,Q=null;for(let f of E){let l=Number((u*f).toFixed(4));for(let d of c){let M=s+d;for(let h of c){let K=C+h,O=iA(g,r,{dx:K,dy:M,scale:l});for(let y of Y){let z=IA(A);v(z,O,B,{alphaGain:y});let F=p(z,B);if(F>a)continue;let cA=S({imageData:z,alphaMap:O,region:{x:B.x,y:B.y,size:r}}),V=x({imageData:z,alphaMap:O,region:{x:B.x,y:B.y,size:r}}),X=Math.abs(cA)*.6+Math.max(0,V);(!Q||X<Q.cost)&&(Q={imageData:z,alphaMap:O,alphaGain:y,shift:{dx:K,dy:M,scale:l},spatialScore:cA,gradientScore:V,nearBlackRatio:F,cost:X})}}}}if(!Q)return null;let H=Q.gradientScore<=e-w,T=Math.abs(Q.spatialScore)<=Math.abs(t)+n;return!H||!T?null:Q}function RP({sourceImageData:A,alphaMap:g,position:B,originalSpatialScore:P,processedSpatialScore:D,originalNearBlackRatio:t}){let e=D,o=1,G=null,c=Math.min(1,t+_A);for(let n of dg){let r=IA(A);if(v(r,g,B,{alphaGain:n}),p(r,B)>c)continue;let Y=S({imageData:r,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}});Y<e&&(e=Y,o=n,G=r)}let E=[];for(let n=-.05;n<=.05;n+=.01)E.push(Number((o+n).toFixed(2)));for(let n of E){if(n<=1||n>=3)continue;let r=IA(A);if(v(r,g,B,{alphaGain:n}),p(r,B)>c)continue;let Y=S({imageData:r,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}});Y<e&&(e=Y,o=n,G=r)}let w=D-e;return!G||w<rP?null:{imageData:G,alphaGain:o,processedSpatialScore:e,suppressionGain:P-e}}function NP({source:A,position:g,baselineSpatialScore:B,baselineGradientScore:P,baselinePositiveHalo:D}){return typeof A=="string"&&A.includes("preview-anchor")&&g?.width>=24&&g?.width<=hg&&(Math.abs(B)<=wP||D>=SA&&Math.abs(B)<=TP)&&P>=CP}function xP(A,g){return A?.provenance?.previewAnchor===!0&&g?.width>=24&&g?.width<=hg}function vP({sourceImageData:A,alphaMap:g,position:B,minAlpha:P,maxAlpha:D,radius:t,strength:e,outsideAlphaMax:o}){let G=IA(A),{width:c,height:E,data:w}=A,n=B.width,r=Math.max(D,1e-6);for(let a=0;a<n;a++)for(let Y=0;Y<n;Y++){let I=g[a*n+Y];if(I<P||I>D)continue;let i=0,C=0,s=0,u=0;for(let T=-t;T<=t;T++)for(let f=-t;f<=t;f++){if(f===0&&T===0)continue;let l=a+T,d=Y+f,M=B.x+d,h=B.y+l;if(M<0||h<0||M>=c||h>=E)continue;let K=0;if(l>=0&&d>=0&&l<n&&d<n&&(K=g[l*n+d]),K>o)continue;let y=1/(Math.sqrt(f*f+T*T)||1),z=(h*c+M)*4;i+=w[z]*y,C+=w[z+1]*y,s+=w[z+2]*y,u+=y}if(u<=0)continue;let Q=Math.max(0,Math.min(1,e*I/r)),H=((B.y+a)*c+(B.x+Y))*4;G.data[H]=Math.round(w[H]*(1-Q)+i/u*Q),G.data[H+1]=Math.round(w[H+1]*(1-Q)+C/u*Q),G.data[H+2]=Math.round(w[H+2]*(1-Q)+s/u*Q)}return G}function bP({sourceImageData:A,alphaMap:g,position:B,source:P,baselineSpatialScore:D,baselineGradientScore:t,minGradientImprovement:e=sP,maxSpatialDrift:o=uP,allowAggressivePresets:G=!1}){let E=dA({imageData:A,position:B,alphaMap:g}).positiveDeltaLum;if(!NP({source:P,position:B,baselineSpatialScore:D,baselineGradientScore:t,baselinePositiveHalo:E}))return null;let w=p(A,B),n=Math.min(1,w+_A),r=t<=QP?lP:E>=SA?MP:e,a=G&&t>=dP&&Math.abs(D)<=.05?[...lg,...hP]:lg,Y=null;for(let I of a){let i=vP({sourceImageData:A,alphaMap:g,position:B,...I});if(p(i,B)>n)continue;let s=S({imageData:i,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),u=x({imageData:i,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),Q=dA({imageData:i,position:B,alphaMap:g}),H=I.minGradientImprovement??r,T=I.maxSpatialDrift??o,f=I.maxAcceptedSpatial??.22,l=u<=t-H,d=Math.abs(s)<=Math.abs(D)+T,M=Math.abs(s)<=f,h=Q.positiveDeltaLum,K=E<SA||h<=E-fP;if(!l||!d||!M||!K)continue;let O=Math.abs(s)*.6+Math.max(0,u)+h*HP;(!Y||O<Y.cost)&&(Y={imageData:i,spatialScore:s,gradientScore:u,halo:Q,cost:O})}return Y}function zg(A,g={}){let B=m(),P=g.debugTimings===!0,D=P?{}:null,t=g.adaptiveMode||"auto",e=t!=="never"&&t!=="off",o=IA(A),{alpha48:G,alpha96:c}=g,E=dg;if(!G||!c)throw new Error("processWatermarkImageData requires alpha48 and alpha96");let w=CA(o.width,o.height),n=Qg({imageData:o,defaultConfig:w,alpha48:G,alpha96:c}),r=n,a=AA(o.width,o.height,r),Y=r.logoSize===96?c:G,I="standard",i=null,C=1,s=null,u=null,Q=null,H=0,T=0,f=null,l=null,d=m(),M=Cg({originalImageData:o,config:r,position:a,alpha48:G,alpha96:c,getAlphaMap:g.getAlphaMap,allowAdaptiveSearch:e,alphaGainCandidates:E});if(P&&(D.initialSelectionMs=m()-d),!M.selectedTrial)return P&&(D.totalMs=m()-B),{imageData:o,meta:Mg({adaptiveConfidence:M.adaptiveConfidence,originalSpatialScore:M.standardSpatialScore,originalGradientScore:M.standardGradientScore,processedSpatialScore:M.standardSpatialScore,processedGradientScore:M.standardGradientScore,suppressionGain:0,alphaGain:1,source:"skipped",decisionTier:M.decisionTier??"insufficient",applied:!1,skipReason:"no-watermark-detected",selectionDebug:null}),debugTimings:D};a=M.position,Y=M.alphaMap,r=M.config,I=M.source,i=M.adaptiveConfidence,u=M.templateWarp,C=M.alphaGain,Q=M.decisionTier;let h=M.selectedTrial,K=xP(h,a),O=h?.provenance?.previewAnchor===!0,y=h.imageData,z=h.originalSpatialScore,F=h.originalGradientScore,cA=m(),V=S({imageData:y,alphaMap:Y,region:{x:a.x,y:a.y,size:a.width}}),X=x({imageData:y,alphaMap:Y,region:{x:a.x,y:a.y,size:a.width}}),Og=p(y,a),pg={index:1,beforeSpatialScore:z,beforeGradientScore:F,afterSpatialScore:V,afterGradientScore:X,improvement:Math.abs(z)-Math.abs(V),gradientDelta:X-F,nearBlackRatio:Og};P&&(D.firstPassMetricsMs=m()-cA);let Kg=Math.max(1,g.maxPasses??4),NA=Math.max(0,Kg-1),xA=SP({originalSpatialScore:z,originalGradientScore:F,firstPassSpatialScore:V,firstPassGradientScore:X}),mg=m(),gA=NA>0&&!xA&&!O?gg({imageData:y,alphaMap:Y,position:a,maxPasses:NA,startingPassIndex:1,alphaGain:C}):null;P&&(D.extraPassMs=m()-mg),y=gA?.imageData??y,H=gA?.passCount??1,T=gA?.attemptedPassCount??1,f=gA?.stopReason??(xA?"residual-low":O?"preview-anchor-single-pass":"max-passes"),l=[pg,...gA?.passes??[]],H>1&&(I=`${I}+multipass`);let Sg=m(),_g=S({imageData:y,alphaMap:Y,region:{x:a.x,y:a.y,size:a.width}}),Rg=x({imageData:y,alphaMap:Y,region:{x:a.x,y:a.y,size:a.width}});P&&(D.finalMetricsMs=m()-Sg);let R=_g,j=Rg,BA=z-R,Ng=m();if(mP({originalScore:z,processedScore:R,suppressionGain:BA})){let PA=p(y,a),N=RP({sourceImageData:y,alphaMap:Y,position:a,originalSpatialScore:z,processedSpatialScore:R,originalNearBlackRatio:PA});N&&(y=N.imageData,C=N.alphaGain,R=N.processedSpatialScore,j=x({imageData:y,alphaMap:Y,region:{x:a.x,y:a.y,size:a.width}}),BA=N.suppressionGain,I=I==="adaptive"?"adaptive+gain":`${I}+gain`)}P&&(D.recalibrationMs=m()-Ng);let vA=0,xg=()=>{let PA=m(),N=bP({sourceImageData:y,alphaMap:Y,position:a,source:I,baselineSpatialScore:R,baselineGradientScore:j,allowAggressivePresets:K});return vA+=m()-PA,N?(y=N.imageData,R=N.spatialScore,j=N.gradientScore,BA=z-R,I=`${I}+edge-cleanup`,!0):!1},vg=m();if(!K&&R<=.3&&j>=iP){let PA=p(y,a),W=_P({sourceImageData:y,alphaMap:Y,position:a,alphaGain:C,originalNearBlackRatio:PA,baselineSpatialScore:R,baselineGradientScore:j,baselineShift:u??{dx:0,dy:0,scale:1},minGain:Hg,shiftCandidates:fg,scaleCandidates:Tg,minGradientImprovement:.04,maxSpatialDrift:.08});W&&(y=W.imageData,Y=W.alphaMap,C=W.alphaGain,R=W.spatialScore,j=W.gradientScore,BA=z-R,I=`${I}+subpixel`,s=W.shift)}P&&(D.subpixelRefinementMs=m()-vg);let bA=0;for(;bA<yP&&xg();)bA++;return P&&(D.previewEdgeCleanupMs=vA,D.totalMs=m()-B),{imageData:y,meta:Mg({position:a,config:r,adaptiveConfidence:i,originalSpatialScore:z,originalGradientScore:F,processedSpatialScore:R,processedGradientScore:j,suppressionGain:BA,templateWarp:u,alphaGain:C,passCount:H,attemptedPassCount:T,passStopReason:f,passes:l,source:I,decisionTier:Q,applied:!0,subpixelShift:s,selectionDebug:yg({selectedTrial:h,selectionSource:M.source,initialConfig:n,initialPosition:AA(o.width,o.height,n)})}),debugTimings:D}}function LP(A,g){if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(A,g);if(typeof document<"u"){let B=document.createElement("canvas");return B.width=A,B.height=g,B}throw new Error("Canvas runtime not available")}function kP(A){let g=A.getContext("2d",{willReadFrequently:!0});if(!g)throw new Error("Failed to get 2D canvas context");return g}var sA=class A{constructor(){this.alphaMaps={}}static async create(){return new A}async getAlphaMap(g){if(g!==48&&g!==96){if(this.alphaMaps[g])return this.alphaMaps[g];let P=await this.getAlphaMap(96),D=L(P,96,g);return this.alphaMaps[g]=D,D}if(this.alphaMaps[g])return this.alphaMaps[g];let B=kA(g);if(!B)throw new Error(`Missing embedded alpha map for size ${g}`);return this.alphaMaps[g]=B,B}async removeWatermarkFromImage(g,B={}){let P=()=>typeof globalThis.performance?.now=="function"?globalThis.performance.now():Date.now(),D=LP(g.width,g.height),t=kP(D),e=P();t.drawImage(g,0,0);let o=P()-e,G=P(),c=t.getImageData(0,0,D.width,D.height),E=P()-G,w=await this.getAlphaMap(48),n=await this.getAlphaMap(96),r=P(),a=zg(c,{alpha48:w,alpha96:n,adaptiveMode:B.adaptiveMode,maxPasses:B.maxPasses,debugTimings:B.debugTimings===!0,getAlphaMap:C=>this.alphaMaps[C]||L(n,96,C)}),Y=P()-r,I=P();t.putImageData(a.imageData,0,0);let i=P()-I;return D.__watermarkMeta=a.meta,D.__watermarkTiming={drawMs:o,getImageDataMs:E,processWatermarkImageDataMs:Y,putImageDataMs:i,processor:a.debugTimings??null},D}getWatermarkInfo(g,B){let P=CA(g,B),D=AA(g,B,P);return{size:P.logoSize,position:D,config:P}}};var RA=null;function FP(){return RA||(RA=sA.create()),RA}function jP(A){return A?{message:A.message||String(A),stack:A.stack||null}:{message:"Unknown error"}}async function WP(A){if(typeof A.convertToBlob=="function")return await A.convertToBlob({type:"image/png"});if(typeof A.toBlob=="function")return await new Promise((g,B)=>{A.toBlob(P=>{P?g(P):B(new Error("Failed to encode PNG blob"))},"image/png")});throw new Error("Canvas blob export API is unavailable")}self.addEventListener("message",async A=>{let g=A.data;if(!g||typeof g.type!="string")return;if(g.type==="ping"){self.postMessage({id:g.id,ok:!0,result:{ready:!0}});return}if(g.type!=="process-image")return;let{id:B,inputBuffer:P,mimeType:D,options:t}=g;try{let e=await FP(),o=new Blob([P],{type:D||"image/png"}),G=await createImageBitmap(o),c=await e.removeWatermarkFromImage(G,t||{});typeof G.close=="function"&&G.close();let w=await(await WP(c)).arrayBuffer();self.postMessage({id:B,ok:!0,result:{processedBuffer:w,mimeType:"image/png",meta:c.__watermarkMeta||null}},[w])}catch(e){self.postMessage({id:B,ok:!1,error:jP(e)})}});})();\n' : "";
  var USERSCRIPT_PAGE_PROCESSOR_CODE = true ? '(()=>{var Vg={48:2304,96:9216},kA={48:"gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAADj4uI+4eDgPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDvBwEA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4WEBD6BgAA/gYAAP4GAAD4AAAAAgYAAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8wcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYAAPIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO5GQkD6BgAA/gYAAP5GQkD4AAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADwAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAO+Hg4D6BgAA/gYAAP/Hw8D4AAAAAgYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPoGAAD+BgAA/gYAAP4GAAD+BgAA+AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAADwAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7AAAAAAAAAACBgIA7oaCgPoGAAD+BgAA/gYAAP4GAAD/BwMA+AAAAAAAAAACBgIA7AAAAAIGAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDsAAAAAAAAAAIGAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAwcBAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADwAAAAAAAAAAIGAADyJiIg9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgIA7AAAAAAAAAAAAAAAAgYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAAAAAAAAAAAAAIGAADwAAAAAgYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO8HAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/o6KiPoGAgDuBgAA8AAAAAIGAgDuBgIA7gYCAO8HAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPAAAAAAAAAAAgYCAO4GAADyBgIA7gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAADyBgAA8gYCAO4mIiD2BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD6BgAA8gYCAO4GAADwAAAAAgYCAO4GAADyBgIA7wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7AAAAAIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO+Hg4D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDsAAAAAAAAAAIGAgDuBgAA8AAAAAIGAgDuBgIA7AAAAAAAAAAAAAAAAgYAAPIGAgDuBgIA7gYAAPAAAAACBgIA7gYCAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4GA+AAAAAAAAAACBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAACBgIA7gYCAO8HAQDwAAAAAgYCAO4GAADwAAAAAgYAAPAAAAACBgAA8gYCAOwAAAACBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+wcDAPYGAgDuBgAA8wcBAPIGAADyBgAA8gYAAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAACBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgDuBgIA7AAAAAMHAQDyBgAA8gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAAD2BgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAOwAAAACBgIA7AAAAAAAAAACBgIA7AAAAAIGAgDsAAAAAgYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO9PS0j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7AAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAAAAAAIGAgDsAAAAAgYAAPIGAgDuBgIA7o6KiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+hoKA+gYCAOwAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAAAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPgAAAACBgIA7gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAADwAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPcHAwD6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgIA9gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgIA7gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDuBgIA7AAAAAAAAAADBwMA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+iYiIPYGAgDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAAAAAAIGAgDsAAAAAAAAAAOHgYD7x8PA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4WEhD6BgIA7gYCAO4GAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAgDsAAAAAgYAAPIGAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAgDuBgAA+wcDAPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAPYGAADzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6GgoD6BgIA9gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4WEBD7BwMA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAAD6BgIA7gYAAPIGAgDuBgIA7AAAAAIGAAD6RkJA+8fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+kZCQPoGAAD6BgIA84eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+gYCAO4GAAD6RkJA+4eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/x8PA+kZCQPoGAAD6BgIA7gYCAO8HAQDwAAAAAgYCAO4GAAD6hoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/wcDAPoGAAD6BgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA7AAAAAAAAAACBgAA8gYCAPaOioj6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP6Oioj6JiIg9gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADyBgIA7gYCAOwAAAAAAAAAAgYCAO4GAADyBgIA94eDgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/BwMA+gYAAPoGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAgYCAO4GAgD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/8/LyPuXkZD6BgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAAAAAAAAAAAAgYAAPAAAAACBgIA94+LiPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD/h4OA+wcDAPYGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDsAAAAAgYCAOwAAAACBgIA7AAAAAIGAgDsAAAAAAAAAAAAAAAAAAAAAgYCAPdHQ0D6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP8HAwD6BgAA9gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgIA7gYCAO4GAgDsAAAAAAAAAAAAAAAAAAAAAgYCAO4GAgDuhoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/oaCgPsHAQDzBwEA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYCAOwAAAAAAAAAAAAAAAAAAAACBgIA7gYCAO4GAADyBgIA7oaCgPoGAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8PCwj6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP9HQ0D6BgAA8gYAAPMHAQDzBwEA8gYCAOwAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYCAO6GgID3j4uI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/4eDgPoGAgD2BgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYCAPMHAQDwAAAAAgYCAO8HAQDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8AAAAAAAAAACBgAA8wcBAPIGAADzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADzJyMg98fDwPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPQAAAACBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgAA8wcBAPIGAADyBgIA7AAAAAAAAAACBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADyBgAA84eBgPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYCAO4GAgDvBwEA8gYAAPIGAgDsAAAAAgYCAO4GAgDvBwEA8wcBAPIGAgDuBgAA8gYCAOwAAAAAAAAAAAAAAAIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYAAPIGAADyBgAA8AAAAAMHAwD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgAA8gYCAO4GAgDuBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgAA8gYCAO4GAAD6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAgD2BgIA7gYCAOwAAAACBgAA8gYAAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAOwAAAACBgAA8gYAAPIGAADyBgIA7gYCAOwAAAAChoKA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPAAAAACBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPAAAAACBgIA7gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7AAAAAIGAgDuBgIA9gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYCAPYGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAw8LCPoKBAT+CgQE/gYAAP4GAAD+hoKA+gYCAO4GAADyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDuBgIA7gYAAPMHAQDyBgIA7gYAAPoKBAT+BgAA/gYAAP4GAAD+BgAA+gYCAO4GAADyBgAA8AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPAAAAAAAAAAAgYAAPIGAADyBgIA7gYCAO/Py8j6BgAA/gYAAP+Hg4D6BgIA7gYCAO4GAADzBwEA8gYCAO4GAgDuBgAA8gYAAPAAAAAAAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAADyBgIA7gYCAO5OSkj6BgAA/gYAAP5OSkj6BgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADyBgIA7AAAAAIGAgDvBwEA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYAAPIGAAD6BgAA/gYAAP4WEBD6BgIA7gYCAO4GAADyBgAA8gYAAPIGAADwAAAAAgYCAOwAAAACBgIA7gYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA7gYCAOwAAAADBwEA8gYAAPIGAgDvh4OA+4eDgPoGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgIA7",96:"gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDwAAAAAwcBAPMHAQDyBgIA8wcBAPIGAADyhoKA8gYAAPIGAADyBgAA8AAAAAIGAADyBgIA7gYCAO4GAgDuBgIA7wcBAPIGAADzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPOXkZD7z8vI+4+LiPu3sbD6BgIA7wcBAPAAAAACBgAA8gYCAO4GAADyBgIA8gYCAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAO8HAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8oaCgPIGAgDyBgIA8wcBAPIGAgDyBgAA8wcBAPIGAgDvBwEA8wcBAPIGAgDyBgAA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDsAAAAAgYCAOwAAAAAAAAAAgYAAPIGAADzBwEA8wcBAPIGAgDvBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8gYCAOwAAAAAAAAAAAAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPYGAAD+BgAA/goEBP4KBAT+RkBA9gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgIA7gYAAPAAAAACBgAA8AAAAAIGAgDuBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcDAPKGgoDyBgIA8oaCgPIGAgDyhoKA8gYCAOwAAAACBgAA8gYCAO4GAADyBgIA8wcBAPIGAADwAAAAAgYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7gYCAO4GAADyBgAA8gYCAOwAAAACBgIA7gYCAOwAAAACBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8AAAAAIGAgDsAAAAAgYCAOwAAAAAAAAAAgYCAO4GAADyBgAA8paQkPoGAAD+BgAA/goEBP4GAAD/FxEQ+AAAAAAAAAACBgIA7gYAAPIGAgDsAAAAAAAAAAIGAgDuBgIA7gYAAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYAAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPKGgoDzBwEA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDyBgIA8gYCAPMHAQDzBwEA8AAAAAIGAgDuBgIA7gYAAPIGAADyhoKA8gYAAPMHAQDwAAAAAgYCAO4GAADyBgAA8AAAAAAAAAAAAAAAAgYAAPIGAADyBgIA7AAAAAIGAgDsAAAAAgYCAO4GAgDsAAAAAgYCAO4GAADyBgIA7gYCAOwAAAACBgIA7gYCAPMHAQDyBgAA8gYCAPIGAgDuBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgIA7gYAAPIGAADzBwEA8paSkPoGAAD+BgAA/goEBP4KBAT+hoKA+gYCAO4GAgDuBgIA7gYCAO4GAgDsAAAAAAAAAAIGAgDuBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8oaCgPIGAgDyBgAA8gYCAO8HAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPMHAQDyhoKA8gYCAPMHAQDzBwEA8AAAAAAAAAACBgIA7wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAADBwEA8gYCAO8HAQDzBwEA8AAAAAIGAADyBgIA7gYCAOwAAAACBgAA8AAAAAIGAgDsAAAAAAAAAAAAAAACBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgIA8wcBAPAAAAACBgIA7AAAAAIGAgDvBwEA85eTkPoGAAD+BgAA/gYAAP4GAAD/z8vI+gYAAPMHAQDyBgIA7gYAAPMHAQDyBgIA7gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYCAO8HAQDyBgIA8oaCgPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAgDsAAAAAwcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPKGgoDyBgIA8oaCgPIGAgDzBwEA8gYCAOwAAAADBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAgDyBgIA8AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAgDsAAAAAgYAAPIGAADyBgIA7gYCAO4GAgDuBgIA7AAAAAIGAgDuBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDuBgIA8oaCgPIGAADyBgIA8AAAAAIGAADyBgIA8gYAAPIGAADyFhAQ+goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/iYgIPoGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8gYAAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAO4GAADyBgIA7gYCAO4GAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAADyBgIA7gYCAPIGAADyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADylpKQ+goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/k5KSPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADzBwEA8wcBAPKGgoDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwMA8oaCgPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA8gYCAO4GAgDsAAAAAgYAAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDvBwEA8gYCAO4GAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDvj4uI+goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/8/LyPoGAADyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAO4GAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYCAO8HAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDzBwEA8oaCgPKGgoDyBgIA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA8gYCAO4GAgDuBgAA8wcBAPIGAgDyBgIA7gYAAPIGAADyBgAA8gYAAPAAAAACBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPKmoKD6BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4WEBD7BwEA8gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgIA8gYAAPIGAgDsAAAAAgYCAO4GAgDuBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgIA8oaCgPIGAgDyBgAA8gYAAPIGAgDyBgIA8oaCgPIGAgDyBgIA8gYCAO8HAQDyBgIA7gYCAOwAAAACBgIA7wcBAPIGAADyBgIA7wcBAPIGAgDuBgAA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8wcBAPAAAAACBgIA7AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPLOysj6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP8PCwj6BgAA8AAAAAIGAgDvBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDyBgAA8gYCAO4GAgDsAAAAAgYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYCAPAAAAACBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyhoKA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcDAPIGAgDyBgIA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO8HAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDzBwEA8wcBAPIGAgDuBgIA7AAAAAIGAgDsAAAAAgYCAO4GAADyBgIA8iYiIPYGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+JiIg9gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAgDsAAAAAgYAAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYCAO4GAgDuBgIA7gYCAO4GAADzBwEA8oaCgPoGAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+FhIQ+gYAAPIGAADyBgIA7AAAAAIGAADyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA7wcBAPIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8gYCAO4GAgDuBgIA7gYAAPAAAAACBgIA7gYAAPIGAADyBgAA8AAAAAAAAAACBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgAA8gYCAOwAAAADBwEA8wcBAPMHAQDwAAAAAAAAAAIGAgDvBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADwAAAAAgYCAO4GAADyBgIA7gYAAPAAAAAAAAAAAgYAAPAAAAACJiIg9goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD/z8vI+gYAAPYGAgDuBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAOwAAAADBwEA8gYAAPIGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPMHAwDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAADwAAAAAgYAAPIGAgDsAAAAAgYAAPMHAQDyBgAA8gYCAOwAAAACBgAA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAO4GAADyBgAA8wcBAPAAAAAAAAAAAgYCAO4GAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO4GAgDuBgIA7AAAAAIGAADyBgIA7gYAAPMHAQDyDgoI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4KCPoGAADyBgAA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDuBgAA8wcBAPIGAgDuBgIA7gYAAPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPKGgoDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA8gYCAO4GAgDuBgIA7gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDvBwEA8gYCAPAAAAAAAAAAAgYCAO4GAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDwAAAAAgYCAOwAAAACBgIA7AAAAAAAAAACBgIA8gYCAPJGQkD3j4uI+goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/8/LyPpGQED2BgAA8oaCgPIGAgDyBgIA8wcBAPIGAADyBgIA8gYCAPIGAADzBwEA8gYAAPIGAgDyBgIA7wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYCAPKGgoDzBwMA8gYCAPIGAADyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8wcBAPIGAgDuBgAA8gYCAO4GAgDsAAAAAgYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAO4GAADyBgIA8gYCAPMHAQDyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYCAPKWkpD6CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP4KBAT+CgQE/goEBP4WEhD7BwEA8gYCAO8HAQDyBgIA8gYAAPMHAQDzBwMA8wcBAPIGAADyBgIA7gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAwDzBwEA8gYCAPIGAADyhoKA8wcBAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgAA8gYAAPAAAAACBgIA7gYAAPIGAgDuBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDvBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP/Py8j6JiIg9wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7gYAAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgIA7gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAO4GAADzBwEA8gYCAOwAAAACBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8paSkPoKBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+zsrI+gYCAPIGAADyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYCAO8HAQDyBgIA8gYCAOwAAAADBwEA8gYCAO4GAgDuBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA8gYAAPIGAgDuBgIA7AAAAAIGAADzBwEA8oaCgPIGAgDzBwEA8gYCAO8HAQDyBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDylpCQ+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4SDAz+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/iYgIPoGAgDuBgIA7gYAAPIGAgDyBgAA8gYCAO4GAADyBgAA8AAAAAIGAADyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDyBgIA8gYAAPIGAgDzBwEA8gYAAPMHAQDyhoKA8oaCgPIGAgDyBgAA8gYCAOwAAAADBwEA8gYCAPIGAgDzBwEA8gYCAO4GAADyBgAA8gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYCAPIGAADyBgAA8AAAAAIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzj4uI+goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/gYAAP4GAAD+CgQE/4+LiPpGQED3BwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYAAPIGAgDvBwEA8gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYCAO4GAgDvBwEA8gYCAPIWEhD6BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP5OSkj6BgAA8wcBAPMHAQDyBgAA8gYCAPIGAgDuBgIA7gYCAO4GAgDvBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgIA8gYCAPIGAADyBgIA8oaCgPIGAgDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8oaCgPIGAADyBgAA8gYCAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYCAO4GAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPIGAgDzBwEA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8AAAAAMHAQDyBgIA82djYPYKBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+DggI/goEBP4GAAD+FhAQ+wcBAPMHAQDyBgIA8gYCAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPMHAQDyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8gYAAPIGAgDsAAAAAAAAAAAAAAAChoKA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDyBgAA8gYCAPMHAQDyBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDwAAAAAgYCAO4GAADyJiIg95eTkPoKBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD/j4uI+sbAwPYGAgDyhoKA8oaCgPMHAQDyBgAA8AAAAAIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8oaCgPIGAADzBwEA8gYAAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7AAAAAAAAAAAAAAAAgYCAOwAAAAAAAAAAAAAAAIGAgDvBwEA8gYCAPIGAADyBgIA7gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyjoqI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPsHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAADyBgIA8wcBAPKGgoDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgAA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgAA8wcBAPMHAQDwAAAAAAAAAAAAAAACBgIA7wcBAPMHAQDyBgIA7gYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPAAAAACBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA8wcBAPIWEhD6CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+XkZD6BgAA8gYCAO4GAgDyBgIA8gYCAO8HAQDyBgIA8gYAAPMHAQDyBgIA7gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPIGAgDuBgIA7AAAAAAAAAACBgIA7gYAAPIGAADzBwEA8gYCAOwAAAAAAAAAAgYCAO4GAgDsAAAAAgYCAO4GAgDsAAAAAwcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8gYCAPIGAgDyBgIA7gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8jYwMPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA+gYCAO4GAgDyBgIA8gYAAPIGAADyBgIA8gYCAO4GAADyhoKA8wcBAPIGAgDyBgIA8gYCAO4GAgDyBgIA8gYCAPIGAgDyBgAA8oaCgPIGAgDzBwEA8gYCAPKGgoDzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYCAO4GAADyBgIA7gYCAO4GAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDsAAAAAgYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8gYCAO4GAgDuBgIA7gYCAO4GAgDuBgAA8wcBAPIGAADzBwEA8gYAAPIGAgDsAAAAAwcBAPIGAADyJiIg98/LyPoKBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD/x8PA+kZCQPYGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYCAPIGAgDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAO8HAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPKGgoDzBwEA8gYAAPIGAADwAAAAAgYCAO4GAADyBgAA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgDvBwEA8wcBAPMHAQDwAAAAAgYCAO4GAgDuBgIA7gYCAO4GAgD3h4OA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/4+LiPomIiD3BwEA8gYCAO4GAgDuBgIA8wcBAPIGAADyBgAA8gYCAO8HAQDyBgIA7gYAAPMHAQDyBgIA8oaCgPMHAQDzBwEA8gYCAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgIA8gYAAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAO4GAgDuBgIA7gYAAPIGAgDzBwEA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgIA7wcBAPIGAgDsAAAAAgYCAO4GAADzBwEA8kZCQPePi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP+Pi4j6BgIA9gYCAO4GAgDuhoKA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPMHAQDyhoKA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDwAAAAAgYAAPIGAADyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADyxsDA94+LiPoKBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/T0tI+gYAAPcHAQDyBgAA8gYCAPIGAgDsAAAAAgYCAO8HAQDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDyBgAA8gYCAPMHAQDyBgAA8gYCAO8HAQDwAAAAAgYCAO4GAADyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAOwAAAACBgAA8gYCAO4GAgDuBgAA8gYAAPJmYmD3V1NQ+gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/4+LiPqGgoD2BgIA8wcDAPIGAADyBgAA8gYCAO4GAADzBwEA8gYCAPMHAQDyBgIA7gYCAPIGAgDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDyhoKA8oaCgPMHAQDzBwEA8gYCAPIGAgDuBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYCAO8HAQDzBwEA8gYCAO8HAQDyBgIA7wcBAPIGAADzBwEA8gYAAPIGAADyBgIA7kZCQPeXk5D6CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4OCAj+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+BgAA/gYAAP+Pi4j6JiIg9gYAAPAAAAAAAAAAAwcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgIA7wcBAPIGAADyBgIA7gYAAPIGAgDzBwEA8gYAAPIGAgDuBgIA7gYCAO4GAADzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADyRkJA95eTkPoKBAT+CgQE/g4ICP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD/j4uI+gYCAPYGAgDuBgIA7gYCAO4GAADzBwEA8oaCgPMHAQDzBwEA8wcBAPKGgoDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA7AAAAAMHAQDzBwEA8gYCAO4GAgDuBgIA7gYCAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgIA7AAAAAIGAADyBgAA8oaCgPMHAQDyBgIA7gYCAO4mICD7z8vI+gYAAP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/8fDwPoWEBD6BgIA7gYCAO4GAgDuBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA7gYAAPIGAADzBwEA8gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcDAPKGgoDwAAAAAgYAAPMHAQDzBwEA8gYCAO4GAgDuBgAA8gYAAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAO4GAADyBgIA8wcBAPMHAQDyBgIA75eRkPoKBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgIA+gYAAPIGAADzBwEA8wcBAPIGAgDuBgIA8wcBAPIGAADyBgAA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgAA8wcBAPMHAwDyhoKA8gYCAPMHAQDwAAAAAgYCAO4GAgDyBgIA8gYAAPIGAADyBgIA7gYCAPIGAADyBgIA7wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA7gYCAO4GAADyBgAA8wcBAPIGAAD2xsLA+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/o6KiPpGQkD3BwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8gYAAPMHAQDyBgIA7gYCAO4GAgDuBgAA8gYAAPMHAQDyBgIA7gYCAO8HAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADzBwEA8iYgIPuHg4D6BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP+Pi4j7R0NA9wcBAPIGAgDuBgIA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA7gYCAOwAAAACBgAA8wcBAPMHAQDyBgIA7gYAAPIGAgDyhoKA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAAD2TkpI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/hYSEPsHAQDyBgAA8gYCAO4GAADyBgIA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYCAPKGgoDzBwEA8gYCAOwAAAADBwEA8gYAAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8iYgIPuPi4j6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP+Xk5D6pqCg+gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAgDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDyBgAA8gYAAPIGAgDuBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyhoKA8gYAAPIGAADyBgIA8wcBAPImIiD2zsrI+gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/g4ICP4KBAT+DggI/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/paSkPomIiD3BwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADzBwEA8wcDAPIGAgDzBwEA8gYCAPIGAgDuBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA9g4KCPvPy8j6CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+lpKQ+kZCQPYGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgAA8wcBAPIGAADyBgAA8kZAQPYWEhD7z8vI+gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/4+LiPoWEhD6ZmJg9gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA7AAAAAIGAADzBwEA8gYAAPIGAADyBgIA7gYAAPIGAgD2FhIQ+8/LyPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/o6KiPomIiD2BgAA8gYCAPIGAADyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAADyFhAQ+w8LCPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4SDAz+BgAA/g4ICP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+xsLA+paQkPsHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDuBgAA+kZCQPvPy8j6BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/g4ICP+Pi4j6joqI+kZAQPoGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPKGgID3FxEQ+o6KiPvPy8j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4OCAj+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP+Xk5D6lpKQ+rawsPpGQkD2BgAA86ehoPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/p6Gg+4+LiPoKBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+DggI/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT/z8vI+8/LyPoKBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT/l5OQ+6ehoPoGAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT/t7Gw+wcBAPKmoqD2hoCA+paSkPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP/X09D6joqI+xcREPpGQED2BgAA8wcBAPIGAgDzBwEA8wcBAPIGAADyFhAQ+oaCgPuPi4j6BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP/Py8j6VlJQ+iYgIPoGAgDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgAA8gYCAO4GAADyBgIA7gYAAPIGAADylpCQ+tbS0PoGAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+DggI/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT/DwsI+iYgIPoGAgDyhoKA8wcBAPMHAQDyBgIA7gYAAPIGAADyBgIA7gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgD2joqI+gYAAP4GAAD+BgAA/g4ICP4OCAj+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD/z8vI+hYSEPpmYmD3BwEA8wcBAPMHAwDzBwMA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgAA8kZCQPYWEhD7j4uI+goEBP4KBAT+CgQE/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/8/LyPoOCgj6RkBA9gYAAPIGAADyBgAA8gYCAPIGAgDyhoKA8wcBAPIGAADyBgIA8wcBAPIGAgDuBgAA8gYCAPIGAADzBwEA8gYCAPKGgoDyBgIA8gYAAPMHAQDyhoKA8oaCgPIGAADzBwEA8gYAAPIGAgDyBgIA9o6KiPoKBAT+BgAA/gYAAP4KBAT+DggI/g4ICP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP/X09D6FhIQ+oaAgPYGAgDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgAA8gYAAPIGAADwAAAAAgYAAPImIiD2npqY+gYAAP4KBAT+DggI/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/gYAAP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/s7KyPpGQkD2BgIA8wcBAPMHAQDyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAgDuBgIA7gYCAO4GAADwAAAAAgYCAO8HAQDzBwEA8oaAgPuHg4D6BgAA/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+DggI/goEBP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP+Xk5D6JiAg+gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA7gYAAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPKGgoDyBgIA8wcBAPIGAADyBgIA7gYAAPIGAADyBgAA8AAAAAIGAADyDgoI+gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4KBAT+BgAA/gYAAP4KBAT+DggI/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/lZSUPrGwMD3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDzBwEA8gYCAO8HAQDyBgIA7gYAAPIGAgDuBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDwAAAAAgYAAPAAAAACBgAA8gYCAO4GAgDsAAAAAwcDAPePi4j6CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/g4ICP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP+Pi4j6JiAg+wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPKGgoDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPIGAADwAAAAAgYCAO8HAQDyBgAA8AAAAAAAAAADBwEA8gYCAO4mIiD2joqI+goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4GAAD+DggI/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/s7KyPqGgID3BwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA7gYCAO4GAgDuBgIA7gYAAPIGAgDuBgIA8gYAAPIGAgDuBgIA8hYSEPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4OCAj+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT/l5GQ+wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyhoKA8wcBAPIGAADyBgIA7gYAAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8oaCgPIGAgDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDzBwEA8gYAAPMHAQDyBgIA7wcBAPIGAgDuBgAA8gYAAPImICD7z8vI+goEBP4GAAD+CgQE/goEBP4OCAj+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/8fDwPomICD7BwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPMHAQDzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPIGAADzBwEA8gYCAPMHAQDyZmJg94+LiPoGAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD/j4uI+iYiIPcHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAO8HAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8kZCQPePi4j6CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+BgAA/gYAAP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYAAPIGAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA8oaCgPIGAgDyBgIA8oaCgPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADyBgIA8gYAAPIGAADyBgIA7gYCAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA8gYCAPIGAgDyBgIA8wcBAPIGAgDyBgIA8gYAAPMHAQDzBwEA8wcBAPJGQkD3j4uI+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4OCAj+CgQE/g4ICP4OCAj+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/09LSPpGQkD3BwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8oaCgPMHAQDyBgIA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyhoCA909LSPoKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+CgQE/gYAAP4KBAT/j4uI+sbAwPYGAgDyBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDwAAAAAgYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDyhoKA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYAAPIGAgDyBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8mZiYPeXk5D6CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/gYAAP4GAAD+CgQE/gYAAP4KBAT+DggI/g4ICP4GAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP+Pi4j6RkJA9gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8wcBAPIGAgDyBgIA7wcBAPMHAQDzBwEA8wcBAPJGQkD3j4uI+g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4GAAD+DggI/4+LiPpGQkD2BgAA8gYAAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADyhoKA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAADyBgIA7gYCAO4GAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyJiIg98/LyPoKBAT+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP4KBAT/19PQ+kZCQPYGAgDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8wcBAPIGAgDzBwEA8gYCAPMHAQDyBgIA8gYAAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPKGgoDyhoKA8oaCgPMHAQDyBgIA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDzBwEA8gYCAPIGAADyBgIA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAgDyhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA7hYQEPoKBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/goEBP4KBAT+DggI/goEBP4KBAT+CgQE/gYAAP4KBAT+NjAw+oaCgPKGgoDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPKGgoDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPIGAgDyhoKA8oaCgPMHAQDyBgIA8gYCAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYAAPOXkZD6BgAA/gYAAP4GAAD+CgQE/gYAAP4GAAD+CgQE/goEBP4GAAD+BgAA/gYAAP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4OCgj6BgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPKGgoDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAwDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPMHAQDyhoKA8oaCgPKGgoDyBgIA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgAA8AAAAAIGAADyBgAA8gYCAO8HAQDyzsrI+gYAAP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/gYAAP4KBAT+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+BgAA/oaCgPoGAgDuBgAA8gYCAO4GAgDzBwEA8wcBAPMHAQDyBgAA8gYCAO4GAADyBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYCAPMHAQDzBwEA8gYCAPMHAQDyBgAA8gYCAPIGAADyBgAA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8wcBAPIGAgDuhoKA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPMHAQDwAAAAAwcBAPMHAQDyBgAA8gYCAPIGAgDyhoKA8oaCgPKGgoDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYAAPMHAQDyBgIA7gYAAPMHAQDyBgAA94eDgPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4GAAD+BgAA/gYAAP4GAAD/j4uI+kZCQPYGAADyBgIA7wcBAPMHAQDyBgIA8oaCgPMHAQDyBgIA7wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDvBwEA8gYAAPIGAADzBwEA8gYCAO4GAADyBgIA7gYCAPMHAQDyBgIA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPoGAAD+BgAA/gYAAP4KBAT+CgQE/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+BgAA/goEBP4KBAT+BgAA/goEBP4GAAD+BgAA/goEBP4KBAT/R0NA9gYCAPIGAgDzBwEA8gYCAPIGAgDzBwEA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAgDyBgAA8gYCAO4GAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPJOSkj6BgAA/gYAAP4KBAT+DggI/gYAAP4KBAT+CgQE/goEBP4GAAD+BgAA/goEBP4KBAT+CgQE/goEBP4GAAD+BgAA/gYAAP4GAAD+BgAA/goEBP4WEhD6BgAA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8gYAAPIGAgDyBgIA7gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgAA8gYAAPMHAQDyBgIA7wcBAPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAADyBgIA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPMHAQDyBgIA8gYCAPMHAQDyBgAA8oaCgPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAO5GQED3j4uI+gYAAP4OCAj+CgQE/goEBP4OCAj+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+BgAA/gYAAP4GAAD+CgQE/5eTkPoGAgDzBwEA8oaCgPIGAgDzBwEA8wcBAPMHAQDyhoKA8gYCAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyhoKA8wcBAPMHAQDyBgIA8gYAAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgIA8wcBAPIGAgDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyJiAg+goEBP4KBAT+DggI/goEBP4OCAj+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+CgQE/qagoPoGAADyBgAA8gYAAPIGAADyBgIA8gYCAPIGAADyBgIA8gYCAO8HAQDyBgAA8wcBAPIGAADyBgAA8gYCAPIGAADyBgIA7gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA7wcBAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDvBwEA8gYAAPIGAgDvBwEA8gYCAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADzBwEA8wcBAPAAAAACBgAA8gYCAO4GAADyBgIA7s7KyPoGAAD+BgAA/gYAAP4GAAD+CgQE/g4ICP4GAAD+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/gYAAP4KBAT+lpKQ+gYCAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAgDyBgIA8gYCAPIGAADyBgAA8gYCAO4GAADyBgIA8wcBAPIGAgDyhoKA8gYCAPIGAADzBwEA8gYCAPMHAQDyBgIA8wcBAPIGAADzBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPIGAADyBgAA8iYiIPfHw8D6BgAA/gYAAP4GAAD+BgAA/goEBP4KBAT+CgQE/g4ICP4OCAj+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+JiIg9wcBAPMHAQDzBwEA8gYCAO4GAgDyBgAA8wcBAPMHAQDyhoKA8wcBAPMHAQDyBgAA8gYCAPMHAQDyhoKA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAgDyBgAA8gYCAO4GAgDvBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAgDyBgIA8gYCAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8gYCAPIGAgDzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDyBgAA8wcBAPIGAADyBgAA8gYCAO8HAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIOCgj6BgAA/gYAAP4GAAD+BgAA/gYAAP4KBAT+DggI/goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/goEBP6WkpD6BgIA8gYCAPIGAgDzBwEA8wcBAPKGgoDzBwEA8wcBAPIGAADzBwEA8gYAAPMHAQDyBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8wcBAPIGAADzBwEA8oaCgPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDyBgIA8gYCAPIGAADyBgIA8wcBAPIGAgDyBgAA8gYCAPIGAADyBgAA8AAAAAIGAADyBgAA8wcBAPIGAADyBgIA8gYAAPIGAADzBwEA8wcBAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8wcBAPIGAgDyBgIA8gYCAPJGQED3z8vI+gYAAP4GAAD+DggI/goEBP4GAAD+CgQE/g4ICP4KBAT+CgQE/goEBP4KBAT+CgQE/4+LiPpmYmD3BwEA8wcBAPKGgoDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8gYAAPKGgoDzBwEA8gYCAPKGgoDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8gYCAPIGAADzBwEA8wcBAPIGAgDzBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAADyBgAA8AAAAAMHAQDzBwEA8wcBAPAAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyDgoI+goEBP4KBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/goEBP4KBAT+CgQE/g4KCPsHAQDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPKGgoDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDyBgIA8wcBAPMHAQDyBgIA8wcBAPIGAgDuBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8oaCgPIGAADyBgAA8gYAAPIGAgDuBgIA7gYCAO8HAQDyBgIA7gYCAO4GAADyBgAA8wcBAPMHAQDyBgIA7wcBAPMHAQDyBgIA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgIA8oaCgPIGAgDzBwEA8gYCAPIGAADyhoCA98/LyPoKBAT+CgQE/goEBP4GAAD+CgQE/goEBP4KBAT+BgAA/gYAAP4KBAT+CgQE/mZiYPYGAADyBgIA8oaCgPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8oaCgPIGAgDvBwEA8gYCAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYCAPIGAADzBwEA8wcBAPMHAQDyBgIA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8gYAAPIGAgDzBwEA8wcBAPMHAQDyBgIA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8gYAAPIGAgDuBgIA7wcBAPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYCAPIGAADyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyBgAA8hYSEPoKBAT+BgAA/goEBP4GAAD+CgQE/goEBP4GAAD+CgQE/gYAAP4KBAT+lpKQ+gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYAAPIGAgDuBgIA7wcBAPIGAgDuBgAA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA8wcBAPIGAgDyBgIA8wcBAPIGAgDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyhoKA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8gYCAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDzBwMA8wcBAPMHAQDzBwEA8AAAAAIGAADzBwEA8AAAAAIGAADyBgIA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgAA8wcBAPIGAADwAAAAAgYAAPMHAQDyBgAA8gYCAO4GAADzBwEA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADyBgAA8kZCQPYKBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/goEBP4KBAT+RkJA9wcBAPIGAgDyBgIA8gYCAPKGgoDzBwEA8wcBAPKGgoDzBwEA8wcBAPMHAQDyBgIA7gYCAO4GAADyBgIA8gYAAPIGAADyBgIA7gYCAO4GAgDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA8gYCAO8HAQDzBwEA8wcBAPMHAQDzBwEA8gYCAO4GAgDvBwEA8gYAAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPMHAQDyBgIA7gYCAO8HAQDyBgAA8AAAAAIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYAAPMPCwj6BgAA/gYAAP4KBAT+CgQE/goEBP4KBAT+BgAA/goEBP7Oysj6BgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDyBgIA8oaCgPKGgoDyBgIA8gYCAPIGAgDvBwEA8gYAAPMHAQDyBgAA8gYAAPIGAgDvBwEA8gYAAPMHAQDzBwEA8gYAAPMHAQDzBwEA8gYCAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgAA8wcBAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgAA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDyBgIA8gYAAPIGAAD6BgAA/gYAAP4KBAT+CgQE/goEBP4OCAj+BgAA/goEBP6WkJD7BwEA8wcBAPIGAADyBgAA8gYCAPKGgoDyBgIA7wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAADwAAAAAgYCAO4GAADzBwEA8gYAAPIGAgDwAAAAAgYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgIA8oaCgPMHAQDyBgAA8gYAAPMHAQDzBwEA8gYAAPIGAgDuBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8wcBAPIGAADyhoKA8wcBAPMHAQDzz8vI+goEBP4KBAT+CgQE/goEBP4OCAj+CgQE/4+LiPoGAgDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDzBwEA8wcBAPKGgoDyBgIA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYCAO4GAADzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8wcBAPIGAADyBgAA8gYAAPIGAgDvBwEA8gYAAPIGAADyBgAA8wcBAPKGgoDyBgAA8gYCAPIGAgDyhoKA8oaCgPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYAAPIGAADyBgAA8wcBAPAAAAADBwEA8wcBAPIGAgDuBgIA7gYAAPIGAgDyBgAA8wcBAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDvBwEA8wcBAPMHAQDyBgIA8gYCAPIGAgDzBwEA8oaCgPMHAQDzBwEA8wcBAPIGAADyVlJQ+goEBP4KBAT+CgQE/goEBP4KBAT+CgQE/paSkPoGAgDyBgIA8wcBAPMHAQDyhoKA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8gYAAPIGAgDyBgIA8gYAAPIGAADyBgAA8gYCAPIGAADzBwEA8gYAAPIGAgDvBwEA8oaCgPIGAgDyBgIA8gYAAPIGAADzBwEA8gYCAPIGAgDzBwEA8gYCAPIGAgDyBgAA8oaCgPIGAADzBwEA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYCAPIGAgDzBwEA8gYCAPMHAQDzBwEA8gYCAPIGAgDyBgIA8gYCAPMHAQDzBwEA8gYAAPMHAQDyBgIA7gYAAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgIA8wcBAPIGAADwAAAAAgYAAPIGAADyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPIGAADzBwEA8gYAAPMHAQDzBwEA8wcBAPMHAQDyJiAg+goEBP4KBAT+CgQE/gYAAP4KBAT+BgAA/iYgIPoGAADyBgIA8gYAAPMHAQDyBgIA8wcBAPIGAgDyBgIA8gYCAPIGAgDzBwEA8gYAAPIGAADzBwEA8gYCAO4GAgDuBgIA7gYAAPIGAADyBgAA8gYAAPMHAQDyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADyhoKA8gYCAO4GAgDsAAAAAgYCAO4GAgDuBgIA7gYAAPAAAAACBgAA8gYCAO4GAgDvBwEA8gYCAPIGAADyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA8gYCAPIGAgDyBgIA8gYCAPMHAQDyhoKA8wcBAPIGAgDyBgAA8wcBAPMHAQDyBgAA8AAAAAIGAgDuBgIA8wcBAPAAAAACBgAA8wcBAPIGAgDuBgAA8gYAAPIGAADzBwEA8gYAAPIGAADyBgAA8gYCAO4GAADyBgIA8gYCAO8HAQDyBgAA8wcBAPMHAQDyBgAA8wcBAPMHAQDyBgAA88/LyPoGAAD+CgQE/goEBP4KBAT/j4uI+gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPKGgoDyBgIA8gYCAPIGAgDyBgIA7gYCAO8HAQDyBgAA8gYAAPIGAADyBgIA7gYAAPIGAgDsAAAAAAAAAAMHAQDyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8wcBAPIGAgDuBgIA7gYAAPMHAQDwAAAAAgYAAPIGAgDuBgIA7gYAAPMHAQDzBwEA8gYAAPMHAQDyBgAA8gYCAPIGAgDzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDyBgAA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgAA8gYAAPKGgoDyBgAA8wcBAPIGAADyBgAA8gYAAPMHAQDyBgAA8gYAAPIGAADyBgIA7wcBAPIGAgDzBwEA8gYAAPAAAAACBgAA8gYAAPMHAQDzBwEA8wcBAPMHAQDyBgIA8wcBAPMHAQDyBgAA8paSkPoKBAT+CgQE/goEBP4KBAT+hoKA+gYAAPMHAQDyhoKA8gYCAPIGAADyBgIA8gYCAPMHAQDyBgIA8oaCgPIGAADyBgAA8gYAAPMHAQDzBwEA8oaCgPIGAgDyBgIA7gYCAPIGAADyBgAA8wcBAPIGAgDyhoKA8wcBAPIGAADyhoKA8gYAAPIGAADyBgIA7gYAAPIGAADyBgAA8gYAAPIGAADyBgAA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgAA8gYAAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAADzBwEA8gYAAPIGAADzBwEA8gYAAPMHAQDyBgIA8gYAAPIGAgDyBgIA8wcBAPMHAQDwAAAAAgYCAO8HAQDyBgAA8gYCAOwAAAACBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPMHAQDzBwEA8gYAAPIGAADyBgIA7wcBAPMHAQDzBwEA8gYAAPMHAQDyBgIA8wcBAPMHAQDzBwEA8xcREPoKBAT+CgQE/goEBP4KBAT+pqCg+wcBAPIGAgDyBgIA8wcBAPIGAADzBwEA8gYCAPIGAgDyBgIA8wcBAPMHAQDyBgIA8gYCAPIGAADyBgAA8gYCAPMHAQDyBgIA7wcBAPIGAADyBgAA8wcBAPIGAADzBwEA8wcBAPIGAgDuBgAA8gYCAO4GAADyBgAA8gYAAPIGAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPIGAADyBgAA8gYCAO4GAgDuBgAA8gYAAPIGAgDuBgAA8gYAAPMHAQDzBwEA8gYAAPIGAADyBgIA8wcBAPMHAQDzBwEA8wcBAPIGAgDzBwEA8gYCAPMHAQDzBwEA8wcBAPIGAgDzBwEA8wcBAPIGAADzBwEA8gYCAO4GAADzBwEA8gYAAPIGAADzBwEA8wcBAPMHAQDzBwEA8wcBAPMHAQDzBwEA8gYCAPMHAQDzBwEA8wcBAPMHAQDyBgIA8gYCAPMHAQDzBwEA8wcBAPIGAADyBgAA8kZAQPYGAAD+CgQE/goEBP4KBAT+JiIg9gYCAPIGAgDyBgIA8wcBAPIGAgDyBgAA8gYCAPMHAQDyBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgAA8gYAAPIGAADyBgIA7gYAAPMHAQDyBgIA7gYCAO4GAgDsAAAAAgYCAO4GAADyBgAA8wcBAPIGAADyBgAA8gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAADyBgIA7gYAAPIGAgDyBgIA7gYAAPAAAAACBgAA8wcBAPMHAQDzBwEA8wcBAPIGAADzBwEA8wcBAPIGAgDyBgAA8wcBAPIGAgDzBwEA8wcBAPKGgoDyBgAA8wcBAPIGAADzBwEA8AAAAAIGAADyBgIA7gYAAPMHAQDyBgAA8gYAAPIGAADyBgAA8wcBAPIGAADzBwEA8gYCAPIGAADyBgIA7wcBAPIGAgDyBgIA8gYAAPMHAQDyBgIA8gYCAPMHAQDyBgIA8wcBAPMHAQDyBgAA8wcBAPOXkZD7h4OA+8/LyPunoaD7BwEA8gYCAPIGAgDzBwEA8gYAAPIGAgDvBwEA8wcBAPIGAADyBgIA8wcBAPIGAADyBgIA8wcBAPMHAQDyBgAA8gYAAPIGAADyBgAA8gYAAPIGAgDvBwEA8wcBAPIGAgDuBgAA8gYAAPIGAgDuBgAA8wcBAPIGAgDyBgIA7gYCAO4GAADzBwEA8wcBAPMHAQDzBwEA8wcBAPIGAgDuBgIA7gYCAPMHAQDyBgIA7gYAAPIGAADyBgAA8"},yA=new Map;function Xg(A){if(typeof Buffer<"u")return Uint8Array.from(Buffer.from(A,"base64"));if(typeof atob<"u"){let g=atob(A),B=new Uint8Array(g.length);for(let P=0;P<g.length;P++)B[P]=g.charCodeAt(P);return B}throw new Error("No base64 decoder available in current runtime")}function FA(A){let g=Number(A);if(!(g in kA))return null;if(!yA.has(g)){let B=Xg(kA[g]),P=Vg[g],D=new Float32Array(B.buffer,B.byteOffset,P);yA.set(g,new Float32Array(D))}return new Float32Array(yA.get(g))}var Jg=.011764705882352941,Zg=.002,qg=.99,$g=255;function v(A,g,B,P={}){let{x:D,y:t,width:o,height:e}=B,n=Number.isFinite(P.alphaGain)&&P.alphaGain>0?P.alphaGain:1;for(let c=0;c<e;c++)for(let r=0;r<o;r++){let w=((t+c)*A.width+(D+r))*4,G=c*o+r,i=g[G];if(Math.max(0,i-Jg)*n<Zg)continue;let a=Math.min(i*n,qg),I=1-a;for(let E=0;E<3;E++){let C=(A.data[w+E]-a*$g)/I;A.data[w+E]=Math.max(0,Math.min(255,Math.round(C)))}}}var AB=Object.freeze({"0.5k":Object.freeze({logoSize:48,marginRight:32,marginBottom:32}),"1k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64}),"2k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64}),"4k":Object.freeze({logoSize:96,marginRight:64,marginBottom:64})});function DA(A,g,B){return B.map(([P,D,t])=>({modelFamily:A,resolutionTier:g,aspectRatio:P,width:D,height:t}))}var jA=Object.freeze([...DA("gemini-3.x-image","0.5k",[["1:1",512,512],["1:4",256,1024],["1:8",192,1536],["2:3",424,632],["3:2",632,424],["3:4",448,600],["4:1",1024,256],["4:3",600,448],["4:5",464,576],["5:4",576,464],["8:1",1536,192],["9:16",384,688],["16:9",688,384],["21:9",792,168]]),...DA("gemini-3.x-image","1k",[["1:1",1024,1024],["1:4",512,2064],["1:8",352,2928],["2:3",848,1264],["3:2",1264,848],["3:4",896,1200],["4:1",2064,512],["4:3",1200,896],["4:5",928,1152],["5:4",1152,928],["8:1",2928,352],["9:16",768,1376],["16:9",1376,768],["16:9",1408,768],["21:9",1584,672]]),...DA("gemini-3.x-image","2k",[["1:1",2048,2048],["1:4",512,2048],["1:8",384,3072],["2:3",1696,2528],["3:2",2528,1696],["3:4",1792,2400],["4:1",2048,512],["4:3",2400,1792],["4:5",1856,2304],["5:4",2304,1856],["8:1",3072,384],["9:16",1536,2752],["16:9",2752,1536],["21:9",3168,1344]]),...DA("gemini-3.x-image","4k",[["1:1",4096,4096],["1:4",2048,8192],["1:8",1536,12288],["2:3",3392,5056],["3:2",5056,3392],["3:4",3584,4800],["4:1",8192,2048],["4:3",4800,3584],["4:5",3712,4608],["5:4",4608,3712],["8:1",12288,1536],["9:16",3072,5504],["16:9",5504,3072],["21:9",6336,2688]]),...DA("gemini-2.5-flash-image","1k",[["1:1",1024,1024],["2:3",832,1248],["3:2",1248,832],["3:4",864,1184],["4:3",1184,864],["4:5",896,1152],["5:4",1152,896],["9:16",768,1344],["16:9",1344,768],["21:9",1536,672]])]),gB=new Map(jA.map(A=>[`${A.width}x${A.height}`,A]));function YA(A){let g=Number(A);if(!Number.isFinite(g))return null;let B=Math.round(g);return B>0?B:null}function BB(A,g,B){return Math.max(g,Math.min(B,A))}function WA(A){return AB[A.resolutionTier]??null}function PB(A){return`${A.logoSize}:${A.marginRight}:${A.marginBottom}`}function QA(A,g){let B=YA(A),P=YA(g);return!B||!P?null:gB.get(`${B}x${P}`)??null}function MA(A,g){let B=QA(A,g);return B?WA(B):null}function fA(A,g,{maxRelativeAspectRatioDelta:B=.02,maxScaleMismatchRatio:P=.12,minLogoSize:D=24,maxLogoSize:t=192,limit:o=3}={}){let e=YA(A),n=YA(g);if(!e||!n)return[];let c=MA(e,n);if(c)return[{...c}];let r=e/n,w=jA.map(Y=>{let a=WA(Y);if(!a)return null;let I=e/Y.width,E=n/Y.height,s=(I+E)/2,C=Y.width/Y.height,u=Math.abs(r-C)/C,y=Math.abs(I-E)/Math.max(I,E);if(u>B||y>P)return null;let f={logoSize:BB(Math.round(a.logoSize*s),D,t),marginRight:Math.max(8,Math.round(a.marginRight*I)),marginBottom:Math.max(8,Math.round(a.marginBottom*E))},H=e-f.marginRight-f.logoSize,d=n-f.marginBottom-f.logoSize;return H<0||d<0?null:{config:f,score:u*100+y*20+Math.abs(Math.log2(Math.max(s,1e-6)))}}).filter(Boolean).sort((Y,a)=>Y.score-a.score),G=[],i=new Set;for(let Y of w){let a=`${Y.config.logoSize}:${Y.config.marginRight}:${Y.config.marginBottom}`;if(!i.has(a)&&(i.add(a),G.push(Y.config),G.length>=o))break}return G}function iA(A,g,B){let P=[];B&&P.push(B),P.push(...fA(A,g));let D=[],t=new Set;for(let o of P){if(!o)continue;let e=PB(o);t.has(e)||(t.add(e),D.push(o))}return D}var DB=.35,JA=1e-8,_=(A,g,B)=>Math.max(g,Math.min(B,A));function UA(A){let g=0;for(let D=0;D<A.length;D++)g+=A[D];let B=g/A.length,P=0;for(let D=0;D<A.length;D++){let t=A[D]-B;P+=t*t}return{mean:B,variance:P/A.length}}function EA(A,g){if(A.length!==g.length||A.length===0)return 0;let B=UA(A),P=UA(g),D=Math.sqrt(B.variance*P.variance)*A.length;if(D<JA)return 0;let t=0;for(let o=0;o<A.length;o++)t+=(A[o]-B.mean)*(g[o]-P.mean);return t/D}function VA(A,g,B,P,D){let t=new Float32Array(D*D);for(let o=0;o<D;o++){let e=(P+o)*g+B,n=o*D;for(let c=0;c<D;c++)t[n+c]=A[e+c]}return t}function ZA(A,g){let{width:B,height:P,data:D}=A,t=g.size??Math.min(g.width,g.height);if(!t||t<=0)return new Float32Array(0);if(g.x<0||g.y<0||g.x+t>B||g.y+t>P)return new Float32Array(0);let o=new Float32Array(t*t);for(let e=0;e<t;e++)for(let n=0;n<t;n++){let c=((g.y+e)*B+(g.x+n))*4;o[e*t+n]=(.2126*D[c]+.7152*D[c+1]+.0722*D[c+2])/255}return o}function tB(A){let{width:g,height:B,data:P}=A,D=new Float32Array(g*B);for(let t=0;t<D.length;t++){let o=t*4;D[t]=(.2126*P[o]+.7152*P[o+1]+.0722*P[o+2])/255}return D}function wA(A,g,B){let P=new Float32Array(g*B);for(let D=1;D<B-1;D++)for(let t=1;t<g-1;t++){let o=D*g+t,e=-A[o-g-1]-2*A[o-1]-A[o+g-1]+A[o-g+1]+2*A[o+1]+A[o+g+1],n=-A[o-g-1]-2*A[o-g]-A[o-g+1]+A[o+g-1]+2*A[o+g]+A[o+g+1];P[o]=Math.sqrt(e*e+n*n)}return P}function XA(A,g,B,P,D){let t=0,o=0,e=0;for(let r=0;r<D;r++){let w=(P+r)*g+B;for(let G=0;G<D;G++){let i=A[w+G];t+=i,o+=i*i,e++}}if(e===0)return 0;let n=t/e,c=Math.max(0,o/e-n*n);return Math.sqrt(c)}function eB(A,g){return wA(A,g,g)}function dA({gray:A,grad:g,width:B,height:P},D,t,o){let{x:e,y:n,size:c}=o;if(e<0||n<0||e+c>B||n+c>P)return null;let r=VA(A,B,e,n,c),w=VA(g,B,e,n,c),G=EA(r,D),i=EA(w,t),Y=0;if(n>8){let I=Math.max(0,n-c),E=Math.min(c,n-I);if(E>8){let s=XA(A,B,e,n,c),C=XA(A,B,e,I,E);C>JA&&(Y=_(1-s/C,0,1))}}let a=Math.max(0,G)*.5+Math.max(0,i)*.3+Y*.2;return{confidence:_(a,0,1),spatialScore:G,gradientScore:i,varianceScore:Y}}function oB(A,g){let B=new Set;for(let P=A;P<=g;P+=8)B.add(P);return 48>=A&&48<=g&&B.add(48),96>=A&&96<=g&&B.add(96),[...B].sort((P,D)=>P-D)}function nB(A,g,B){return iA(A,g,B)}function HA(A,g,B){if(A.has(B))return A.get(B);let P=B===96?g:L(g,96,B),D=eB(P,B),t={alpha:P,grad:D};return A.set(B,t),t}function sA(A,g,{dx:B=0,dy:P=0,scale:D=1}={}){if(g<=0)return new Float32Array(0);if(!Number.isFinite(B)||!Number.isFinite(P)||!Number.isFinite(D)||D<=0)return new Float32Array(0);if(B===0&&P===0&&D===1)return new Float32Array(A);let t=(n,c)=>{let r=Math.floor(n),w=Math.floor(c),G=n-r,i=c-w,Y=_(r,0,g-1),a=_(w,0,g-1),I=_(r+1,0,g-1),E=_(w+1,0,g-1),s=A[a*g+Y],C=A[a*g+I],u=A[E*g+Y],y=A[E*g+I],f=s+(C-s)*G,H=u+(y-u)*G;return f+(H-f)*i},o=new Float32Array(g*g),e=(g-1)/2;for(let n=0;n<g;n++)for(let c=0;c<g;c++){let r=(c-e)/D+e+B,w=(n-e)/D+e+P;o[n*g+c]=t(r,w)}return o}function L(A,g,B){if(B<=0)return new Float32Array(0);if(g===B)return new Float32Array(A);let P=new Float32Array(B*B),D=(g-1)/Math.max(1,B-1);for(let t=0;t<B;t++){let o=t*D,e=Math.floor(o),n=Math.min(g-1,e+1),c=o-e;for(let r=0;r<B;r++){let w=r*D,G=Math.floor(w),i=Math.min(g-1,G+1),Y=w-G,a=A[e*g+G],I=A[e*g+i],E=A[n*g+G],s=A[n*g+i],C=a+(I-a)*Y,u=E+(s-E)*Y;P[t*B+r]=C+(u-C)*c}}return P}function S({imageData:A,alphaMap:g,region:B}){let P=ZA(A,B);return P.length===0||P.length!==g.length?0:EA(P,g)}function x({imageData:A,alphaMap:g,region:B}){let P=ZA(A,B);if(P.length===0||P.length!==g.length)return 0;let D=B.size??Math.min(B.width,B.height);if(!D||D<=2)return 0;let t=wA(P,D,D),o=wA(g,D,D);return EA(t,o)}function qA({processedImageData:A,alphaMap:g,position:B,residualThreshold:P=.22,originalImageData:D=null,originalSpatialMismatchThreshold:t=0}){return!!(S({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width??B.size}})>=P||D&&S({imageData:D,alphaMap:g,region:{x:B.x,y:B.y,size:B.width??B.size}})<=t)}function $A({imageData:A,alpha96:g,defaultConfig:B,threshold:P=DB}){let{width:D,height:t}=A,o=tB(A),e=wA(o,D,t),n={gray:o,grad:e,width:D,height:t},c=new Map,w=nB(D,t,B).map(Q=>{let T=Q.logoSize,M={size:T,x:D-Q.marginRight-T,y:t-Q.marginBottom-T};if(M.x<0||M.y<0||M.x+T>D||M.y+T>t)return null;let h=HA(c,g,T),m=dA(n,h.alpha,h.grad,M);return m?{...M,...m}:null}).filter(Boolean),G=w.reduce((Q,T)=>!Q||T.confidence>Q.confidence?T:Q,null);if(G&&G.confidence>=P+.08)return{found:!0,confidence:G.confidence,spatialScore:G.spatialScore,gradientScore:G.gradientScore,varianceScore:G.varianceScore,region:{x:G.x,y:G.y,size:G.size}};let i=B.logoSize,Y=_(Math.round(i*.65),24,144),a=_(Math.min(Math.round(i*2.8),Math.floor(Math.min(D,t)*.4)),Y,192),I=oB(Y,a),E=Math.max(32,Math.round(i*.75)),s=_(B.marginRight-E,8,D-Y-1),C=_(B.marginRight+E,s,D-Y-1),u=_(B.marginBottom-E,8,t-Y-1),y=_(B.marginBottom+E,u,t-Y-1),f=[],H=Q=>{f.push(Q),f.sort((T,M)=>M.adjustedScore-T.adjustedScore),f.length>5&&(f.length=5)};for(let Q of w)H({size:Q.size,x:Q.x,y:Q.y,adjustedScore:Q.confidence*Math.min(1,Math.sqrt(Q.size/96))});for(let Q of I){let T=HA(c,g,Q);for(let M=s;M<=C;M+=8){let h=D-M-Q;if(!(h<0))for(let m=u;m<=y;m+=8){let p=t-m-Q;if(p<0)continue;let l=dA(n,T.alpha,T.grad,{x:h,y:p,size:Q});if(!l)continue;let z=l.confidence*Math.min(1,Math.sqrt(Q/96));z<.08||H({size:Q,x:h,y:p,adjustedScore:z})}}}let d=G??{x:D-B.marginRight-B.logoSize,y:t-B.marginBottom-B.logoSize,size:B.logoSize,confidence:0,spatialScore:0,gradientScore:0,varianceScore:0};for(let Q of f){let T=_(Q.size-10,Y,a),M=_(Q.size+10,Y,a);for(let h=T;h<=M;h+=2){let m=HA(c,g,h);for(let p=Q.x-8;p<=Q.x+8;p+=2)if(!(p<0||p+h>D))for(let l=Q.y-8;l<=Q.y+8;l+=2){if(l<0||l+h>t)continue;let z=dA(n,m.alpha,m.grad,{x:p,y:l,size:h});z&&z.confidence>d.confidence&&(d={x:p,y:l,size:h,...z})}}}return{found:d.confidence>=P,confidence:d.confidence,spatialScore:d.spatialScore,gradientScore:d.gradientScore,varianceScore:d.varianceScore,region:{x:d.x,y:d.y,size:d.size}}}var TA=5,Ag=1,GB=.8,cB=1.5,IB=.5,rB=.2,aB=.12,YB=.35,iB=.01,EB=3;function tA(A){return typeof ImageData<"u"&&A instanceof ImageData?new ImageData(new Uint8ClampedArray(A.data),A.width,A.height):{width:A.width,height:A.height,data:new Uint8ClampedArray(A.data)}}function O(A,g){let B=0,P=0;for(let D=0;D<g.height;D++)for(let t=0;t<g.width;t++){let o=((g.y+D)*A.width+(g.x+t))*4,e=A.data[o],n=A.data[o+1],c=A.data[o+2];e<=TA&&n<=TA&&c<=TA&&B++,P++}return P>0?B/P:0}function hA(A,g){let B=0,P=0,D=0;for(let e=0;e<g.height;e++)for(let n=0;n<g.width;n++){let c=((g.y+e)*A.width+(g.x+n))*4,r=.2126*A.data[c]+.7152*A.data[c+1]+.0722*A.data[c+2];B+=r,P+=r*r,D++}let t=D>0?B/D:0,o=D>0?Math.max(0,P/D-t*t):0;return{meanLum:t,stdLum:Math.sqrt(o)}}function gg(A,g){return hA(A,g)}function zA({imageData:A,position:g,alphaMap:B,minAlpha:P=aB,maxAlpha:D=YB,outsideAlphaMax:t=iB,outerMargin:o=EB}){let e=0,n=0,c=0,r=0,w=0,G=0;for(let C=-o;C<g.height+o;C++)for(let u=-o;u<g.width+o;u++){let y=g.x+u,f=g.y+C;if(y<0||f<0||y>=A.width||f>=A.height)continue;let H=(f*A.width+y)*4,d=.2126*A.data[H]+.7152*A.data[H+1]+.0722*A.data[H+2],Q=C>=0&&u>=0&&C<g.height&&u<g.width,T=Q?B[C*g.width+u]:0;if(Q&&T>=P&&T<=D){e+=d,n+=d*d,c++;continue}(!Q||T<=t)&&(r+=d,w+=d*d,G++)}let i=c>0?e/c:0,Y=G>0?r/G:0,a=c>0?Math.sqrt(Math.max(0,n/c-i*i)):0,I=G>0?Math.sqrt(Math.max(0,w/G-Y*Y)):0,E=i-Y,s=E/Math.max(1,I);return{bandCount:c,outerCount:G,bandMeanLum:i,outerMeanLum:Y,bandStdLum:a,outerStdLum:I,deltaLum:E,positiveDeltaLum:Math.max(0,E),visibility:s}}function wB(A,g){let B=A.y-A.height;return B<0?null:{x:A.x,y:B,width:A.width,height:A.height}}function pA({originalImageData:A,referenceImageData:g,candidateImageData:B,position:P}){let D=B?hA(B,P):null;return OA({originalImageData:A,referenceImageData:g,candidateTextureStats:D,position:P})}function OA({originalImageData:A,referenceImageData:g,candidateTextureStats:B,position:P}){let D=g??A,t=D?wB(P,D):null,o=t?hA(D,t):null,e=o&&B?Math.max(0,o.meanLum-B.meanLum-Ag)/Math.max(1,o.meanLum):0,n=o&&B?Math.max(0,o.stdLum*GB-B.stdLum)/Math.max(1,o.stdLum):0,c=o&&B?Math.max(0,o.meanLum-B.meanLum-Ag)/Math.max(1,o.stdLum):0,r=e>0,w=n>0,G=r&&c>=cB,i=r&&w&&e>=IB&&n>=rB;return{referenceTextureStats:o,candidateTextureStats:B,darknessPenalty:e,flatnessPenalty:n,darknessVisibility:c,texturePenalty:e*2+n*2,tooDark:r,tooFlat:w,visibleDarkHole:G,hardReject:i||G}}function U(A,g,B){return{spatialScore:S({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),gradientScore:x({imageData:A,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}})}}var sB=4,CB=.25,uB=.05;function Bg(A,g,B,P={}){let D=A&&typeof A=="object"&&"imageData"in A&&g===void 0,t=D?A.imageData:A,o=D?A.alphaMap:g,e=D?A.position:B,n=D?A:P,c=Math.max(1,n.maxPasses??sB),r=n.residualThreshold??CB,w=Math.max(0,n.startingPassIndex??0),G=Number.isFinite(n.alphaGain)&&n.alphaGain>0?n.alphaGain:1,i=tA(t),Y=i,a=O(i,e),I=Math.min(1,a+uB),E=[],s="max-passes",C=w,u=w;for(let y=0;y<c;y++){u=w+y+1;let f=U(i,o,e),H=tA(i);v(H,o,e,{alphaGain:G});let d=U(H,o,e),Q=O(H,e),T=Math.abs(f.spatialScore)-Math.abs(d.spatialScore),M=d.gradientScore-f.gradientScore,h=pA({referenceImageData:Y,candidateImageData:H,position:e});if(Q>I){s="safety-near-black";break}if(h.hardReject){s="safety-texture-collapse";break}if(i=H,C=w+y+1,E.push({index:C,beforeSpatialScore:f.spatialScore,beforeGradientScore:f.gradientScore,afterSpatialScore:d.spatialScore,afterGradientScore:d.gradientScore,improvement:T,gradientDelta:M,nearBlackRatio:Q}),Math.abs(d.spatialScore)<=r){s="residual-low";break}}return{imageData:i,passCount:C,attemptedPassCount:u,stopReason:s,passes:E}}function J(A){return typeof A=="number"&&Number.isFinite(A)?A:null}function Pg({spatialScore:A,gradientScore:g}){let B=J(A),P=J(g);return B===null||P===null?{tier:"insufficient"}:B>=.3&&P>=.12||B>=.295&&P>=.45?{tier:"direct-match"}:B>0||P>0?{tier:"needs-validation"}:{tier:"insufficient"}}function Dg(A){if(!A||A.found!==!0)return{tier:"insufficient"};let g=J(A.confidence),B=J(A.spatialScore),P=J(A.gradientScore),D=J(A?.region?.size);return g===null||B===null||P===null||D===null?{tier:"insufficient"}:g>=.5&&B>=.45&&P>=.12&&D>=40&&D<=192?{tier:"direct-match"}:D>=40&&D<=192&&P>=.12&&(g>0||B>0)?{tier:"needs-validation"}:{tier:"insufficient"}}function eA({spatialScore:A,gradientScore:g}){return Pg({spatialScore:A,gradientScore:g}).tier==="direct-match"}function oA(A){return Dg(A).tier==="direct-match"}var lB=.05,yB=.08,QB=.22,MB=.04,fB=.25,dB=.22,HB=.08,TB=.18,hB=.05,zB=.35,pB=.8,OB=.12,mB=.65,KB=.3,SB=.02,_B=.02,RB=.03,ig=[-.5,-.25,0,.25,.5],Eg=[.99,1,1.01],tg=[-12,-8,-4,0,4,8,12],NB=[-2,-1,0,1,2],xB=[-12,-10,-8,-6,-4,-2,2,4,6,8,10,12],eg=24,vB=1.05,bB=.55,og=16,ng=8,LB=2,Gg=2,cg=8,kB=.2,mA=[-1,0,1],FB=[-1,-.5,0,.5,1],jB=[.985,1,1.015],WB=.22,UB=.24,Ig=Object.freeze({x:0,y:0});function CA(...A){let g={};for(let B of A)!B||typeof B!="object"||Object.assign(g,B);return Object.keys(g).length>0?g:null}function rg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:o=null,includeCatalogVariants:e=!0}){let n=e?iA(A.width,A.height,g):[g],c=[];for(let r of n){let w=r===g?B:{x:A.width-r.marginRight-r.logoSize,y:A.height-r.marginBottom-r.logoSize,width:r.logoSize,height:r.logoSize};if(w.x<0||w.y<0||w.x+w.width>A.width||w.y+w.height>A.height)continue;let G=typeof o=="function"?o(r.logoSize):GA(r.logoSize,{alpha48:P,alpha96:D,getAlphaMap:t});G&&c.push({config:r,position:w,alphaMap:G,source:r===g?"standard":"standard+catalog",provenance:r===g?null:{catalogVariant:!0}})}return c}function KA(A,{directMatch:g=!1}={}){return A?g?"direct-match":A.source?.includes("validated")||A.accepted?"validated-match":"safe-removal":"insufficient"}function nA(A){return A?Math.abs(A.processedSpatialScore)>dB||Math.max(0,A.processedGradientScore)>HB:!0}function VB(A,g){return A?Number(A.position?.width)>=72&&Number(g?.height)>Number(g?.width)*1.25&&(Math.abs(A.processedSpatialScore)>TB||Math.max(0,A.processedGradientScore)>hB):!0}function GA(A,{alpha48:g,alpha96:B,getAlphaMap:P}={}){if(A===48)return g;if(A===96)return B;let D=typeof P=="function"?P(A):null;return D||(B?L(B,96,A):null)}function XB({alpha48:A,alpha96:g,getAlphaMap:B}){let P=new Map;return D=>{if(P.has(D))return P.get(D);let t=GA(D,{alpha48:A,alpha96:g,getAlphaMap:B});return P.set(D,t),t}}function JB(A){return A?Math.abs(A.processedSpatialScore)>WB||Math.max(0,A.processedGradientScore)>UB:!0}function b({originalImageData:A,alphaMap:g,position:B,source:P,config:D,baselineNearBlackRatio:t,adaptiveConfidence:o=null,alphaGain:e=1,provenance:n=null,includeImageData:c=!0}){if(!g||!B)return null;let r=U(A,g,B),w=qB({originalImageData:A,alphaMap:g,position:B,alphaGain:e}),G={x:Ig.x,y:Ig.y,width:B.width,height:B.height},i=U(w,g,G),Y=O(w,G),a=Y-t,I=r.spatialScore-i.spatialScore,E=i.gradientScore-r.gradientScore,s=OA({originalImageData:A,referenceImageData:A,candidateTextureStats:gg(w,G),position:B}),C=s.texturePenalty;return{accepted:s.hardReject!==!0&&a<=lB&&I>=yB&&(Math.abs(i.spatialScore)<=QB||E<=MB),source:P,config:D,position:B,alphaMap:g,adaptiveConfidence:o,alphaGain:e,provenance:CA(n),imageData:c?wg(A,g,B,e):null,originalSpatialScore:r.spatialScore,originalGradientScore:r.gradientScore,processedSpatialScore:i.spatialScore,processedGradientScore:i.gradientScore,improvement:I,nearBlackRatio:Y,nearBlackIncrease:a,gradientIncrease:E,tooDark:s.tooDark,tooFlat:s.tooFlat,hardReject:s.hardReject,texturePenalty:C,validationCost:Math.abs(i.spatialScore)+Math.max(0,i.gradientScore)*.6+Math.max(0,a)*3+C}}function ZB(A){let g=A.filter(B=>B?.accepted);return g.length===0?null:(g.sort((B,P)=>B.validationCost!==P.validationCost?B.validationCost-P.validationCost:P.improvement-B.improvement),g[0])}function qB({originalImageData:A,alphaMap:g,position:B,alphaGain:P}){let D={width:B.width,height:B.height,data:new Uint8ClampedArray(B.width*B.height*4)};for(let t=0;t<B.height;t++){let o=((B.y+t)*A.width+B.x)*4,e=o+B.width*4,n=t*B.width*4;D.data.set(A.data.subarray(o,e),n)}return v(D,g,{x:0,y:0,width:B.width,height:B.height},{alphaGain:P}),D}function wg(A,g,B,P){let D=tA(A);return v(D,g,B,{alphaGain:P}),D}function q(A,g){return!A||A.imageData?A:{...A,imageData:wg(g,A.alphaMap,A.position,A.alphaGain??1)}}function k(A,g,B=.005){return g?.accepted?A?DP(A,g)?A:ag(A,g)?g:ag(g,A)?A:g.validationCost<A.validationCost-B||Math.abs(g.validationCost-A.validationCost)<=B&&g.improvement>A.improvement+.01?g:A:g:A}function $(A){return typeof A?.source=="string"&&A.source.startsWith("standard")}function $B(A){return $(A)&&(A?.provenance?.localShift===!0||A?.provenance?.sizeJitter===!0||String(A?.source||"").includes("+warp"))}function AP(A){return $(A)&&A?.provenance?.localShift!==!0&&A?.provenance?.sizeJitter!==!0}function gP(A){let g=Number(A?.originalSpatialScore),B=Number(A?.originalGradientScore);return!Number.isFinite(g)||!Number.isFinite(B)?!1:B>=zB||g>=pB}function BP(A){let g=Number(A?.originalSpatialScore),B=Number(A?.originalGradientScore);return!Number.isFinite(g)||!Number.isFinite(B)?!1:B<OB||g<mB}function PP(A,g){let B=Number(A?.processedGradientScore),P=Number(g?.processedGradientScore);return!Number.isFinite(B)||!Number.isFinite(P)?!1:Math.max(0,B)<=_B&&Math.max(0,P)>=RB}function SA(A,g){if(!AP(A)||!$B(g))return!1;let B=Number(A.validationCost)-Number(g.validationCost);return Number.isFinite(B)?gP(A)&&BP(g)&&B<KB||PP(A,g):!1}function DP(A,g){return A?.provenance?.localShift===!0||!$(g)?!1:SA(A,g)}function tP(A,g){return A?.provenance?.localShift!==!0||!$(A)||!$(g)||!g?.accepted?!1:SA(g,A)}function sg(A){return A?Math.max(0,Number(A.processedGradientScore))<=SB:!1}function eP(A,g){if(!g||g.logoSize!==48)return!1;let B=Number(A?.width),P=Number(A?.height);return!Number.isFinite(B)||!Number.isFinite(P)||B<384||B>1536||P<384||P>1536||Math.max(B,P)<512?!1:QA(B,P)===null}function ag(A,g){if(g?.provenance?.previewAnchor!==!0||!A||A?.provenance?.previewAnchor===!0)return!1;let B=Number(A.originalSpatialScore),P=Number(A.originalGradientScore),D=Number(g.originalSpatialScore),t=Number(g.originalGradientScore);if(!Number.isFinite(B)||!Number.isFinite(P)||!Number.isFinite(D)||!Number.isFinite(t))return!1;let o=eA({spatialScore:B,gradientScore:P});return eA({spatialScore:D,gradientScore:t})&&!o?!0:t>=P+.2&&D>=B+.05}function oP({originalImageData:A,alphaMap:g,position:B,baselineSpatialScore:P,baselineGradientScore:D,shiftCandidates:t=ig,scaleCandidates:o=Eg}){let e=B.width;if(!e||e<=8)return null;let n={spatialScore:P,gradientScore:D,shift:{dx:0,dy:0,scale:1},alphaMap:g};for(let w of o)for(let G of t)for(let i of t){if(i===0&&G===0&&w===1)continue;let Y=sA(g,e,{dx:i,dy:G,scale:w}),a=S({imageData:A,alphaMap:Y,region:{x:B.x,y:B.y,size:e}}),I=x({imageData:A,alphaMap:Y,region:{x:B.x,y:B.y,size:e}}),E=Math.max(0,a)*.7+Math.max(0,I)*.3,s=Math.max(0,n.spatialScore)*.7+Math.max(0,n.gradientScore)*.3;E>s+.01&&(n={spatialScore:a,gradientScore:I,shift:{dx:i,dy:G,scale:w},alphaMap:Y})}let c=n.spatialScore>=P+.01,r=n.gradientScore>=D+.01;return c||r?n:null}function nP({originalImageData:A,candidateSeeds:g,adaptiveConfidence:B=null}){if(!Array.isArray(g)||g.length===0)return null;let P=null;for(let D of g)if(!sg(D))for(let t of tg)for(let o of tg){if(o===0&&t===0)continue;let e={x:D.position.x+o,y:D.position.y+t,width:D.position.width,height:D.position.height};if(e.x<0||e.y<0||e.x+e.width>A.width||e.y+e.height>A.height)continue;let n=b({originalImageData:A,alphaMap:D.alphaMap,position:e,source:`${D.source}+local`,config:D.config,baselineNearBlackRatio:O(A,e),adaptiveConfidence:B,provenance:CA(D.provenance,{localShift:!0}),includeImageData:!1});n?.accepted&&(P=k(P,n,.002))}return P}function GP({originalImageData:A,candidateSeeds:g,alpha48:B,alpha96:P,getAlphaMap:D,resolveAlphaMap:t=null,adaptiveConfidence:o=null}){if(!Array.isArray(g)||g.length===0)return null;let e=null;for(let n of g)for(let c of xB){let r=n.position.width+c;if(r<=24||r===n.position.width)continue;let w={x:A.width-n.config.marginRight-r,y:A.height-n.config.marginBottom-r,width:r,height:r};if(w.x<0||w.y<0||w.x+w.width>A.width||w.y+w.height>A.height)continue;let G=typeof t=="function"?t(r):GA(r,{alpha48:B,alpha96:P,getAlphaMap:D});if(!G)continue;let i=b({originalImageData:A,alphaMap:G,position:w,source:`${n.source}+size`,config:{logoSize:r,marginRight:n.config.marginRight,marginBottom:n.config.marginBottom},baselineNearBlackRatio:O(A,w),adaptiveConfidence:o,provenance:CA(n.provenance,{sizeJitter:!0}),includeImageData:!1});i?.accepted&&(e=k(e,i,.002))}return e}function cP({originalImageData:A,seedCandidate:g,adaptiveConfidence:B=null,shiftCandidates:P=NB}){if(!g?.alphaMap||!g?.position||sg(g))return null;let D=null;for(let t of P)for(let o of P){if(o===0&&t===0)continue;let e={x:g.position.x+o,y:g.position.y+t,width:g.position.width,height:g.position.height};if(e.x<0||e.y<0||e.x+e.width>A.width||e.y+e.height>A.height)continue;let n=b({originalImageData:A,alphaMap:g.alphaMap,position:e,source:`${g.source}+local`,config:g.config,baselineNearBlackRatio:O(A,e),adaptiveConfidence:B,provenance:CA(g.provenance,{localShift:!0}),includeImageData:!1});n?.accepted&&(D=k(D,n,.002))}return D}function IP({originalImageData:A,seedCandidate:g,adaptiveConfidence:B=null,alphaGainCandidates:P=[]}){if(!g?.alphaMap||!g?.position)return null;let D=null;for(let t of P){if(!Number.isFinite(t)||t<=1)continue;let o=b({originalImageData:A,alphaMap:g.alphaMap,position:g.position,source:`${g.source}+gain`,config:g.config,baselineNearBlackRatio:O(A,g.position),adaptiveConfidence:B,alphaGain:t,provenance:g.provenance,includeImageData:!1});o?.accepted&&(D=k(D,o,.002))}return D}function rP(A,g){A.push(g),A.sort((B,P)=>P.coarseScore-B.coarseScore),A.length>cg&&(A.length=cg)}function aP({originalImageData:A,config:g,alpha48:B,alpha96:P,getAlphaMap:D,resolveAlphaMap:t=null,adaptiveConfidence:o=null}){if(!eP(A,g))return null;let e=Math.max(eg,Math.round(g.logoSize*bB)),n=Math.max(e,Math.round(g.logoSize*vB)),c=Math.max(8,g.marginRight-og),r=g.marginRight+ng,w=Math.max(8,g.marginBottom-og),G=g.marginBottom+ng,i=[];for(let a=e;a<=n;a+=LB){let I=typeof t=="function"?t(a):GA(a,{alpha48:B,alpha96:P,getAlphaMap:D});if(I)for(let E=c;E<=r;E+=Gg){let s=A.width-E-a;if(!(s<0||s+a>A.width))for(let C=w;C<=G;C+=Gg){let u=A.height-C-a;if(u<0||u+a>A.height)continue;let y=S({imageData:A,alphaMap:I,region:{x:s,y:u,size:a}}),f=x({imageData:A,alphaMap:I,region:{x:s,y:u,size:a}}),H=Math.max(0,f)*.6+Math.max(0,y)*.4;H<kB||rP(i,{coarseScore:H,alphaMap:I,position:{x:s,y:u,width:a,height:a},config:{logoSize:a,marginRight:E,marginBottom:C}})}}}let Y=null;for(let a of i)for(let I of mA){let E=a.position.width+I;if(E<eg)continue;let s=typeof t=="function"?t(E):GA(E,{alpha48:B,alpha96:P,getAlphaMap:D});if(s)for(let C of mA)for(let u of mA){let y={x:a.position.x+C,y:a.position.y+u,width:E,height:E};if(y.x<0||y.y<0||y.x+y.width>A.width||y.y+y.height>A.height)continue;let f={logoSize:E,marginRight:A.width-y.x-E,marginBottom:A.height-y.y-E},H=b({originalImageData:A,alphaMap:s,position:y,source:"standard+preview-anchor",config:f,baselineNearBlackRatio:O(A,y),adaptiveConfidence:o,provenance:{previewAnchor:!0,previewAnchorLocalRefine:I!==0||C!==0||u!==0},includeImageData:!1});H?.accepted&&(Y=k(Y,H,.002))}}return Y}function Yg({originalImageData:A,candidateSeeds:g}){let B=g.map(e=>b({originalImageData:A,alphaMap:e.alphaMap,position:e.position,source:e.source,config:e.config,baselineNearBlackRatio:O(A,e.position),provenance:e.provenance,includeImageData:!1})).filter(Boolean),P=B.find(e=>e.source==="standard")??B[0]??null,D=P?.originalSpatialScore??null,t=P?.originalGradientScore??null,o=eA({spatialScore:D,gradientScore:t});return{standardTrials:B,standardTrial:P,standardSpatialScore:D,standardGradientScore:t,hasReliableStandardMatch:o}}function YP({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:o}){let e=rg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:o,includeCatalogVariants:!1}),n=Yg({originalImageData:A,candidateSeeds:e});return!n.hasReliableStandardMatch&&(!n.standardTrial||nA(n.standardTrial))&&(e=rg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:o,includeCatalogVariants:!0}),n=Yg({originalImageData:A,candidateSeeds:e})),{standardCandidateSeeds:e,...n}}function iP(A,{reliableMatch:g=!1}={}){return A?.accepted?g?{candidate:A,decisionTier:"direct-match"}:{candidate:{...A,source:`${A.source}+validated`},decisionTier:"validated-match"}:null}function Z(A,g,B,{reliableMatch:P=!1,minCostDelta:D=.002}={}){let t=iP(B,{reliableMatch:P});if(!t)return{baseCandidate:A,baseDecisionTier:g};if(SA(A,t.candidate))return{baseCandidate:A,baseDecisionTier:g};let o=A,e=k(A,t.candidate,D);return{baseCandidate:e,baseDecisionTier:e!==o?t.decisionTier:g}}function EP({originalImageData:A,config:g,alpha96:B,resolveAlphaMap:P,allowAdaptiveSearch:D}){if(!D||!B)return{adaptive:null,adaptiveConfidence:null,adaptiveTrial:null};let t=$A({imageData:A,alpha96:B,defaultConfig:g}),o=t?.confidence??null;if(!t?.region||!(oA(t)||t.confidence>=fB))return{adaptive:t,adaptiveConfidence:o,adaptiveTrial:null};let e=t.region.size,n={x:t.region.x,y:t.region.y,width:e,height:e},c=P(e);if(!c)throw new Error(`Missing alpha map for adaptive size ${e}`);let r={logoSize:e,marginRight:A.width-n.x-e,marginBottom:A.height-n.y-e};return{adaptive:t,adaptiveConfidence:o,adaptiveTrial:b({originalImageData:A,alphaMap:c,position:n,source:"adaptive",config:r,baselineNearBlackRatio:O(A,n),adaptiveConfidence:t.confidence,provenance:{adaptive:!0},includeImageData:!1})}}function wP({originalImageData:A,baseCandidate:g,baseDecisionTier:B,adaptiveConfidence:P,alphaGainCandidates:D}){let t=q(g,A),o=g.alphaMap,e=g.position,n=g.config,c=g.source,r=B||KA(g),w=null,G=g.alphaGain??1,i=oP({originalImageData:A,alphaMap:o,position:e,baselineSpatialScore:t.originalSpatialScore,baselineGradientScore:t.originalGradientScore,shiftCandidates:t.provenance?.previewAnchor===!0?FB:ig,scaleCandidates:t.provenance?.previewAnchor===!0?jB:Eg});if(i){let I=b({originalImageData:A,alphaMap:i.alphaMap,position:e,source:`${c}+warp`,config:n,baselineNearBlackRatio:O(A,e),adaptiveConfidence:P,provenance:t.provenance,includeImageData:!1}),E=k(t,I);E!==t&&(o=I.alphaMap,c=E.source,t=q(E,A),w=i.shift,r=KA(E,{directMatch:r==="direct-match"}))}let Y=t.provenance?.previewAnchor===!0?JB(t):nA(t),a=t;if(Y)for(let I of D){let E=b({originalImageData:A,alphaMap:o,position:e,source:`${c}+gain`,config:n,baselineNearBlackRatio:O(A,e),adaptiveConfidence:P,alphaGain:I,provenance:t.provenance,includeImageData:!1});a=k(a,E)}return a!==t&&(t=q(a,A),c=a.source,G=a.alphaGain,r=KA(a,{directMatch:r==="direct-match"})),{selectedTrial:q(t,A),source:c,alphaMap:o,position:e,config:n,templateWarp:w,alphaGain:G,decisionTier:r}}function Cg({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,allowAdaptiveSearch:o,alphaGainCandidates:e}){let n=XB({alpha48:P,alpha96:D,getAlphaMap:t}),c=g.logoSize===96?D:P,{standardCandidateSeeds:r,standardTrials:w,standardTrial:G,standardSpatialScore:i,standardGradientScore:Y,hasReliableStandardMatch:a}=YP({originalImageData:A,config:g,position:B,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:n}),I=null,E="insufficient";if(a&&G?.accepted?(I=G,E="direct-match"):G?.accepted&&(I={...G,source:`${G.source}+validated`},E="validated-match"),!I&&G&&a){let z=IP({originalImageData:A,seedCandidate:{...G,source:"standard+validated"},adaptiveConfidence:null,alphaGainCandidates:e});z&&(I=z,E="validated-match")}let s=null,C=null,u=null;for(let l of w)!l||l===G||({baseCandidate:I,baseDecisionTier:E}=Z(I,E,l,{reliableMatch:eA({spatialScore:l.originalSpatialScore,gradientScore:l.originalGradientScore})}));let y=aP({originalImageData:A,config:g,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:n,adaptiveConfidence:C});if(y&&({baseCandidate:I,baseDecisionTier:E}=Z(I,E,y)),E!=="direct-match"&&!I?.provenance?.previewAnchor&&nA(I)){let l=GP({originalImageData:A,candidateSeeds:r,alpha48:P,alpha96:D,getAlphaMap:t,resolveAlphaMap:n});l&&({baseCandidate:I,baseDecisionTier:E}=Z(I,E,l))}if(E!=="direct-match"&&I?.provenance?.sizeJitter===!0&&!I?.provenance?.previewAnchor&&$(I)&&nA(I)){let l=cP({originalImageData:A,seedCandidate:I,adaptiveConfidence:C});l&&({baseCandidate:I,baseDecisionTier:E}=Z(I,E,l))}if((!o||!D?!1:I?nA(I)?(I=q(I,A),qA({processedImageData:I.imageData,alphaMap:I.alphaMap,position:I.position,originalImageData:A,originalSpatialMismatchThreshold:0})):!1:!0)&&({adaptive:s,adaptiveConfidence:C,adaptiveTrial:u}=EP({originalImageData:A,config:g,alpha96:D,resolveAlphaMap:n,allowAdaptiveSearch:o})),u&&({baseCandidate:I,baseDecisionTier:E}=Z(I,E,u,{reliableMatch:oA(s)})),!I?.provenance?.previewAnchor&&!oA(s)&&VB(I,A)){let l=nP({originalImageData:A,candidateSeeds:r,adaptiveConfidence:C});l&&({baseCandidate:I,baseDecisionTier:E}=Z(I,E,l))}if(I||(a&&G?(I=G,E="direct-match"):oA(s)&&u&&(I=u,E="direct-match")),!I){let l=ZB([G,u]);if(!l)return{selectedTrial:null,source:"skipped",alphaMap:c,position:B,config:g,adaptiveConfidence:C,standardSpatialScore:i,standardGradientScore:Y,templateWarp:null,alphaGain:1,decisionTier:"insufficient"};I={...l,source:`${l.source}+validated`},E="validated-match"}tP(I,G)&&(I=G,E=a?"direct-match":"validated-match");let{selectedTrial:H,source:d,alphaMap:Q,position:T,config:M,templateWarp:h,alphaGain:m,decisionTier:p}=wP({originalImageData:A,baseCandidate:I,baseDecisionTier:E,adaptiveConfidence:C,alphaGainCandidates:e});return{selectedTrial:q(H,A),source:d,alphaMap:Q,position:T,config:M,adaptiveConfidence:C,standardSpatialScore:i,standardGradientScore:Y,templateWarp:h,alphaGain:m,decisionTier:p}}function ug(A){if(!A||typeof A!="object")return null;let{logoSize:g,marginRight:B,marginBottom:P}=A;return[g,B,P].every(Number.isFinite)?{logoSize:g,marginRight:B,marginBottom:P}:null}function lg(A){if(!A||typeof A!="object")return null;let{x:g,y:B,width:P,height:D}=A;return[g,B,P,D].every(Number.isFinite)?{x:g,y:B,width:P,height:D}:null}function yg({selectedTrial:A,selectionSource:g=null,initialConfig:B=null,initialPosition:P=null}={}){return A?{candidateSource:typeof g=="string"&&g?g:typeof A.source=="string"?A.source:null,initialConfig:ug(B),initialPosition:lg(P),finalConfig:ug(A.config),finalPosition:lg(A.position),texturePenalty:Number.isFinite(A.texturePenalty)?A.texturePenalty:null,tooDark:A.tooDark===!0,tooFlat:A.tooFlat===!0,hardReject:A.hardReject===!0,usedCatalogVariant:A.provenance?.catalogVariant===!0,usedSizeJitter:A.provenance?.sizeJitter===!0,usedLocalShift:A.provenance?.localShift===!0,usedAdaptive:A.provenance?.adaptive===!0,usedPreviewAnchor:A.provenance?.previewAnchor===!0}:null}function uA(A,g){let B=MA(A,g);return B?{...B}:A>1024&&g>1024?{logoSize:96,marginRight:64,marginBottom:64}:{logoSize:48,marginRight:32,marginBottom:32}}function AA(A,g,B){let{logoSize:P,marginRight:D,marginBottom:t}=B;return{x:A-D-P,y:g-t-P,width:P,height:P}}function _A(A){return A===96?{logoSize:96,marginRight:64,marginBottom:64}:{logoSize:48,marginRight:32,marginBottom:32}}function sP(A,g,B){return A?A.logoSize===48?g:A.logoSize===96?B:B?L(B,96,A.logoSize):null:null}function CP(A,g){return g.x>=0&&g.y>=0&&g.x+g.width<=A.width&&g.y+g.height<=A.height}function Qg({imageData:A,defaultConfig:g,alpha48:B,alpha96:P,minSwitchScore:D=.25,minScoreDelta:t=.08}){if(!A||!g||!B||!P)return g;let o=_A(48),e=g.logoSize===96?_A(96):o,n=g.logoSize===96?o:_A(96),c=[e,n];for(let G of fA(A.width,A.height,{limit:1}))c.some(i=>i.logoSize===G.logoSize&&i.marginRight===G.marginRight&&i.marginBottom===G.marginBottom)||c.push(G);let r=null,w=Number.NEGATIVE_INFINITY;for(let G of c){let i=AA(A.width,A.height,G);if(!CP(A,i))continue;let Y=sP(G,B,P);if(!Y)continue;let a=S({imageData:A,alphaMap:Y,region:{x:i.x,y:i.y,size:i.width}});if(!r){r=G,w=a;continue}a>=D&&a>w+t&&(r=G,w=a)}return r??g}var uP=.5,lP=.18,yP=.18,NA=.05,QP=.42,dg=1.2,Hg=[-.25,0,.25],Tg=[.99,1,1.01],hg=[1.05,1.12,1.2,1.28,1.36,1.45,1.52,1.6,1.7,1.85,2,2.2,2.4,2.6],zg=40,MP=.08,fP=.1,dP=.03,HP=.04,TP=3,hP=.16,zP=.005,pP=.01,OP=.02,mP=1.5,RA=4,KP=.18,Mg=Object.freeze([{minAlpha:.02,maxAlpha:.45,radius:2,strength:.7,outsideAlphaMax:.05},{minAlpha:.05,maxAlpha:.55,radius:3,strength:.7,outsideAlphaMax:.08},{minAlpha:.1,maxAlpha:.7,radius:3,strength:.8,outsideAlphaMax:.12},{minAlpha:.01,maxAlpha:.35,radius:4,strength:1.4,outsideAlphaMax:.05}]),SP=.45,_P=Object.freeze([{minAlpha:.01,maxAlpha:.55,radius:2,strength:1.3,outsideAlphaMax:.05,minGradientImprovement:.12,maxSpatialDrift:.18,maxAcceptedSpatial:.18}]),RP=.08,NP=.2;function K(){return typeof globalThis.performance?.now=="function"?globalThis.performance.now():Date.now()}function cA(A){return typeof ImageData<"u"&&A instanceof ImageData?new ImageData(new Uint8ClampedArray(A.data),A.width,A.height):{width:A.width,height:A.height,data:new Uint8ClampedArray(A.data)}}function xP(A){if(!A)return null;let{x:g,y:B,width:P,height:D}=A;return[g,B,P,D].every(t=>Number.isFinite(t))?{x:g,y:B,width:P,height:D}:null}function vP(A){if(!A)return null;let{logoSize:g,marginRight:B,marginBottom:P}=A;return[g,B,P].every(D=>Number.isFinite(D))?{logoSize:g,marginRight:B,marginBottom:P}:null}function fg({position:A=null,config:g=null,adaptiveConfidence:B=null,originalSpatialScore:P=null,originalGradientScore:D=null,processedSpatialScore:t=null,processedGradientScore:o=null,suppressionGain:e=null,templateWarp:n=null,alphaGain:c=1,passCount:r=0,attemptedPassCount:w=0,passStopReason:G=null,passes:i=null,source:Y="standard",decisionTier:a=null,applied:I=!0,skipReason:E=null,subpixelShift:s=null,selectionDebug:C=null}={}){let u=xP(A);return{applied:I,skipReason:I?null:E,size:u?u.width:null,position:u,config:vP(g),detection:{adaptiveConfidence:B,originalSpatialScore:P,originalGradientScore:D,processedSpatialScore:t,processedGradientScore:o,suppressionGain:e},templateWarp:n??null,alphaGain:c,passCount:r,attemptedPassCount:w,passStopReason:G,passes:Array.isArray(i)?i:null,source:Y,decisionTier:a,subpixelShift:s??null,selectionDebug:C}}function bP({originalScore:A,processedScore:g,suppressionGain:B}){return A>=.6&&g>=uP&&B<=lP}function LP({originalSpatialScore:A,originalGradientScore:g,firstPassSpatialScore:B,firstPassGradientScore:P}){return Math.abs(B)<=.25?!0:A>=0&&B<0&&P<=RP&&g-P>=NP}function kP({sourceImageData:A,alphaMap:g,position:B,alphaGain:P,originalNearBlackRatio:D,baselineSpatialScore:t,baselineGradientScore:o,baselineShift:e,minGain:n=dg,shiftCandidates:c=Hg,scaleCandidates:r=Tg,minGradientImprovement:w=.04,maxSpatialDrift:G=.08}){let i=B.width;if(!i||i<=8||P<n)return null;let Y=Math.min(1,D+NA),a=[P],I=Math.max(1,Number((P-.01).toFixed(2))),E=Number((P+.01).toFixed(2));I!==P&&a.push(I),E!==P&&a.push(E);let s=e?.dx??0,C=e?.dy??0,u=e?.scale??1,y=null;for(let d of r){let Q=Number((u*d).toFixed(4));for(let T of c){let M=C+T;for(let h of c){let m=s+h,p=sA(g,i,{dx:m,dy:M,scale:Q});for(let l of a){let z=cA(A);v(z,p,B,{alphaGain:l});let F=O(z,B);if(F>Y)continue;let aA=S({imageData:z,alphaMap:p,region:{x:B.x,y:B.y,size:i}}),V=x({imageData:z,alphaMap:p,region:{x:B.x,y:B.y,size:i}}),X=Math.abs(aA)*.6+Math.max(0,V);(!y||X<y.cost)&&(y={imageData:z,alphaMap:p,alphaGain:l,shift:{dx:m,dy:M,scale:Q},spatialScore:aA,gradientScore:V,nearBlackRatio:F,cost:X})}}}}if(!y)return null;let f=y.gradientScore<=o-w,H=Math.abs(y.spatialScore)<=Math.abs(t)+G;return!f||!H?null:y}function FP({sourceImageData:A,alphaMap:g,position:B,originalSpatialScore:P,processedSpatialScore:D,originalNearBlackRatio:t}){let o=D,e=1,n=null,c=Math.min(1,t+NA);for(let G of hg){let i=cA(A);if(v(i,g,B,{alphaGain:G}),O(i,B)>c)continue;let a=S({imageData:i,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}});a<o&&(o=a,e=G,n=i)}let r=[];for(let G=-.05;G<=.05;G+=.01)r.push(Number((e+G).toFixed(2)));for(let G of r){if(G<=1||G>=3)continue;let i=cA(A);if(v(i,g,B,{alphaGain:G}),O(i,B)>c)continue;let a=S({imageData:i,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}});a<o&&(o=a,e=G,n=i)}let w=D-o;return!n||w<yP?null:{imageData:n,alphaGain:e,processedSpatialScore:o,suppressionGain:P-o}}function jP({source:A,position:g,baselineSpatialScore:B,baselineGradientScore:P,baselinePositiveHalo:D}){return typeof A=="string"&&A.includes("preview-anchor")&&g?.width>=24&&g?.width<=zg&&(Math.abs(B)<=MP||D>=RA&&Math.abs(B)<=KP)&&P>=fP}function WP(A,g){return A?.provenance?.previewAnchor===!0&&g?.width>=24&&g?.width<=zg}function UP({sourceImageData:A,alphaMap:g,position:B,minAlpha:P,maxAlpha:D,radius:t,strength:o,outsideAlphaMax:e}){let n=cA(A),{width:c,height:r,data:w}=A,G=B.width,i=Math.max(D,1e-6);for(let Y=0;Y<G;Y++)for(let a=0;a<G;a++){let I=g[Y*G+a];if(I<P||I>D)continue;let E=0,s=0,C=0,u=0;for(let H=-t;H<=t;H++)for(let d=-t;d<=t;d++){if(d===0&&H===0)continue;let Q=Y+H,T=a+d,M=B.x+T,h=B.y+Q;if(M<0||h<0||M>=c||h>=r)continue;let m=0;if(Q>=0&&T>=0&&Q<G&&T<G&&(m=g[Q*G+T]),m>e)continue;let l=1/(Math.sqrt(d*d+H*H)||1),z=(h*c+M)*4;E+=w[z]*l,s+=w[z+1]*l,C+=w[z+2]*l,u+=l}if(u<=0)continue;let y=Math.max(0,Math.min(1,o*I/i)),f=((B.y+Y)*c+(B.x+a))*4;n.data[f]=Math.round(w[f]*(1-y)+E/u*y),n.data[f+1]=Math.round(w[f+1]*(1-y)+s/u*y),n.data[f+2]=Math.round(w[f+2]*(1-y)+C/u*y)}return n}function VP({sourceImageData:A,alphaMap:g,position:B,source:P,baselineSpatialScore:D,baselineGradientScore:t,minGradientImprovement:o=dP,maxSpatialDrift:e=HP,allowAggressivePresets:n=!1}){let r=zA({imageData:A,position:B,alphaMap:g}).positiveDeltaLum;if(!jP({source:P,position:B,baselineSpatialScore:D,baselineGradientScore:t,baselinePositiveHalo:r}))return null;let w=O(A,B),G=Math.min(1,w+NA),i=t<=hP?zP:r>=RA?pP:o,Y=n&&t>=SP&&Math.abs(D)<=.05?[...Mg,..._P]:Mg,a=null;for(let I of Y){let E=UP({sourceImageData:A,alphaMap:g,position:B,...I});if(O(E,B)>G)continue;let C=S({imageData:E,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),u=x({imageData:E,alphaMap:g,region:{x:B.x,y:B.y,size:B.width}}),y=zA({imageData:E,position:B,alphaMap:g}),f=I.minGradientImprovement??i,H=I.maxSpatialDrift??e,d=I.maxAcceptedSpatial??.22,Q=u<=t-f,T=Math.abs(C)<=Math.abs(D)+H,M=Math.abs(C)<=d,h=y.positiveDeltaLum,m=r<RA||h<=r-mP;if(!Q||!T||!M||!m)continue;let p=Math.abs(C)*.6+Math.max(0,u)+h*OP;(!a||p<a.cost)&&(a={imageData:E,spatialScore:C,gradientScore:u,halo:y,cost:p})}return a}function pg(A,g={}){let B=K(),P=g.debugTimings===!0,D=P?{}:null,t=g.adaptiveMode||"auto",o=t!=="never"&&t!=="off",e=cA(A),{alpha48:n,alpha96:c}=g,r=hg;if(!n||!c)throw new Error("processWatermarkImageData requires alpha48 and alpha96");let w=uA(e.width,e.height),G=Qg({imageData:e,defaultConfig:w,alpha48:n,alpha96:c}),i=G,Y=AA(e.width,e.height,i),a=i.logoSize===96?c:n,I="standard",E=null,s=1,C=null,u=null,y=null,f=0,H=0,d=null,Q=null,T=K(),M=Cg({originalImageData:e,config:i,position:Y,alpha48:n,alpha96:c,getAlphaMap:g.getAlphaMap,allowAdaptiveSearch:o,alphaGainCandidates:r});if(P&&(D.initialSelectionMs=K()-T),!M.selectedTrial)return P&&(D.totalMs=K()-B),{imageData:e,meta:fg({adaptiveConfidence:M.adaptiveConfidence,originalSpatialScore:M.standardSpatialScore,originalGradientScore:M.standardGradientScore,processedSpatialScore:M.standardSpatialScore,processedGradientScore:M.standardGradientScore,suppressionGain:0,alphaGain:1,source:"skipped",decisionTier:M.decisionTier??"insufficient",applied:!1,skipReason:"no-watermark-detected",selectionDebug:null}),debugTimings:D};Y=M.position,a=M.alphaMap,i=M.config,I=M.source,E=M.adaptiveConfidence,u=M.templateWarp,s=M.alphaGain,y=M.decisionTier;let h=M.selectedTrial,m=WP(h,Y),p=h?.provenance?.previewAnchor===!0,l=h.imageData,z=h.originalSpatialScore,F=h.originalGradientScore,aA=K(),V=S({imageData:l,alphaMap:a,region:{x:Y.x,y:Y.y,size:Y.width}}),X=x({imageData:l,alphaMap:a,region:{x:Y.x,y:Y.y,size:Y.width}}),Ng=O(l,Y),xg={index:1,beforeSpatialScore:z,beforeGradientScore:F,afterSpatialScore:V,afterGradientScore:X,improvement:Math.abs(z)-Math.abs(V),gradientDelta:X-F,nearBlackRatio:Ng};P&&(D.firstPassMetricsMs=K()-aA);let vg=Math.max(1,g.maxPasses??4),xA=Math.max(0,vg-1),vA=LP({originalSpatialScore:z,originalGradientScore:F,firstPassSpatialScore:V,firstPassGradientScore:X}),bg=K(),gA=xA>0&&!vA&&!p?Bg({imageData:l,alphaMap:a,position:Y,maxPasses:xA,startingPassIndex:1,alphaGain:s}):null;P&&(D.extraPassMs=K()-bg),l=gA?.imageData??l,f=gA?.passCount??1,H=gA?.attemptedPassCount??1,d=gA?.stopReason??(vA?"residual-low":p?"preview-anchor-single-pass":"max-passes"),Q=[xg,...gA?.passes??[]],f>1&&(I=`${I}+multipass`);let Lg=K(),kg=S({imageData:l,alphaMap:a,region:{x:Y.x,y:Y.y,size:Y.width}}),Fg=x({imageData:l,alphaMap:a,region:{x:Y.x,y:Y.y,size:Y.width}});P&&(D.finalMetricsMs=K()-Lg);let R=kg,j=Fg,BA=z-R,jg=K();if(bP({originalScore:z,processedScore:R,suppressionGain:BA})){let PA=O(l,Y),N=FP({sourceImageData:l,alphaMap:a,position:Y,originalSpatialScore:z,processedSpatialScore:R,originalNearBlackRatio:PA});N&&(l=N.imageData,s=N.alphaGain,R=N.processedSpatialScore,j=x({imageData:l,alphaMap:a,region:{x:Y.x,y:Y.y,size:Y.width}}),BA=N.suppressionGain,I=I==="adaptive"?"adaptive+gain":`${I}+gain`)}P&&(D.recalibrationMs=K()-jg);let bA=0,Wg=()=>{let PA=K(),N=VP({sourceImageData:l,alphaMap:a,position:Y,source:I,baselineSpatialScore:R,baselineGradientScore:j,allowAggressivePresets:m});return bA+=K()-PA,N?(l=N.imageData,R=N.spatialScore,j=N.gradientScore,BA=z-R,I=`${I}+edge-cleanup`,!0):!1},Ug=K();if(!m&&R<=.3&&j>=QP){let PA=O(l,Y),W=kP({sourceImageData:l,alphaMap:a,position:Y,alphaGain:s,originalNearBlackRatio:PA,baselineSpatialScore:R,baselineGradientScore:j,baselineShift:u??{dx:0,dy:0,scale:1},minGain:dg,shiftCandidates:Hg,scaleCandidates:Tg,minGradientImprovement:.04,maxSpatialDrift:.08});W&&(l=W.imageData,a=W.alphaMap,s=W.alphaGain,R=W.spatialScore,j=W.gradientScore,BA=z-R,I=`${I}+subpixel`,C=W.shift)}P&&(D.subpixelRefinementMs=K()-Ug);let LA=0;for(;LA<TP&&Wg();)LA++;return P&&(D.previewEdgeCleanupMs=bA,D.totalMs=K()-B),{imageData:l,meta:fg({position:Y,config:i,adaptiveConfidence:E,originalSpatialScore:z,originalGradientScore:F,processedSpatialScore:R,processedGradientScore:j,suppressionGain:BA,templateWarp:u,alphaGain:s,passCount:f,attemptedPassCount:H,passStopReason:d,passes:Q,source:I,decisionTier:y,applied:!0,subpixelShift:C,selectionDebug:yg({selectedTrial:h,selectionSource:M.source,initialConfig:G,initialPosition:AA(e.width,e.height,G)})}),debugTimings:D}}function XP(A,g){if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(A,g);if(typeof document<"u"){let B=document.createElement("canvas");return B.width=A,B.height=g,B}throw new Error("Canvas runtime not available")}function JP(A){let g=A.getContext("2d",{willReadFrequently:!0});if(!g)throw new Error("Failed to get 2D canvas context");return g}var lA=class A{constructor(){this.alphaMaps={}}static async create(){return new A}async getAlphaMap(g){if(g!==48&&g!==96){if(this.alphaMaps[g])return this.alphaMaps[g];let P=await this.getAlphaMap(96),D=L(P,96,g);return this.alphaMaps[g]=D,D}if(this.alphaMaps[g])return this.alphaMaps[g];let B=FA(g);if(!B)throw new Error(`Missing embedded alpha map for size ${g}`);return this.alphaMaps[g]=B,B}async removeWatermarkFromImage(g,B={}){let P=()=>typeof globalThis.performance?.now=="function"?globalThis.performance.now():Date.now(),D=XP(g.width,g.height),t=JP(D),o=P();t.drawImage(g,0,0);let e=P()-o,n=P(),c=t.getImageData(0,0,D.width,D.height),r=P()-n,w=await this.getAlphaMap(48),G=await this.getAlphaMap(96),i=P(),Y=pg(c,{alpha48:w,alpha96:G,adaptiveMode:B.adaptiveMode,maxPasses:B.maxPasses,debugTimings:B.debugTimings===!0,getAlphaMap:s=>this.alphaMaps[s]||L(G,96,s)}),a=P()-i,I=P();t.putImageData(Y.imageData,0,0);let E=P()-I;return D.__watermarkMeta=Y.meta,D.__watermarkTiming={drawMs:e,getImageDataMs:r,processWatermarkImageDataMs:a,putImageDataMs:E,processor:Y.debugTimings??null},D}getWatermarkInfo(g,B){let P=uA(g,B),D=AA(g,B,P);return{size:P.logoSize,position:D,config:P}}};async function Og(A,g="image/png"){if(typeof A?.convertToBlob=="function")return await A.convertToBlob({type:g});if(typeof A?.toBlob=="function")return await new Promise((B,P)=>{A.toBlob(D=>{D?B(D):P(new Error("Failed to encode image blob"))},g)});throw new Error("Canvas blob export API is unavailable")}function ZP(A){try{return JSON.stringify(A)}catch{return""}}function mg(A,g="Unknown error"){if(A instanceof Error)return A.message||g;if(typeof A=="string")return A.trim()||g;if(A&&typeof A=="object"){if(typeof A.message=="string"&&A.message.trim())return A.message.trim();if(typeof A.error=="string"&&A.error.trim())return A.error.trim();let B=Number.isFinite(A.status)?String(A.status):"",P=typeof A.statusText=="string"?A.statusText.trim():"",D=`${B} ${P}`.trim();if(D)return D;let t=ZP(A);if(t&&t!=="{}")return t}return g}var qP="gwr:page-process-request",Kg="gwr:page-process-response",IA="__gwrPageProcessBridgeInstalled__";function $P(A,g){if(!g||!A||A===g)return!0;try{if(A.window===g||A.self===g)return!0}catch{}try{if(g.window===A||g.self===A)return!0}catch{}return!1}function Sg(A,g=null){return{processedBlob:A,processedMeta:g}}async function AD(A){let g=A instanceof Blob?Sg(A,null):Sg(A?.processedBlob,A?.processedMeta??null),B=g.processedBlob;if(!(B instanceof Blob))throw new Error("Page bridge processor must return a Blob");return{processedBuffer:await B.arrayBuffer(),mimeType:B.type||"image/png",meta:g.processedMeta??null}}function gD({targetWindow:A=globalThis.window||null,processWatermarkBlob:g,removeWatermarkFromBlob:B,logger:P=console}={}){return async function(t){if(!t?.data||t.data.type!==qP||!$P(t?.source,A)||!A||typeof A.postMessage!="function")return;let o=typeof t.data.requestId=="string"?t.data.requestId:"",e=typeof t.data.action=="string"?t.data.action:"";if(!(!o||!e))try{let n=new Blob([t.data.inputBuffer],{type:t.data.mimeType||"image/png"}),c;if(e==="process-watermark-blob"){if(typeof g!="function")throw new Error("processWatermarkBlob page bridge handler unavailable");c=await g(n,t.data.options||{})}else if(e==="remove-watermark-blob"){if(typeof B!="function")throw new Error("removeWatermarkFromBlob page bridge handler unavailable");c=await B(n,t.data.options||{})}else throw new Error(`Unknown page bridge action: ${e}`);let r=await AD(c);A.postMessage({type:Kg,requestId:o,ok:!0,action:e,result:r},"*",[r.processedBuffer])}catch(n){P?.warn?.("[Gemini Watermark Remover] Page bridge request failed:",n),A.postMessage({type:Kg,requestId:o,ok:!1,action:e,error:mg(n,"Page bridge failed")},"*")}}}function _g(A={}){let{targetWindow:g=globalThis.window||null}=A;if(!g||typeof g.addEventListener!="function")return null;if(g[IA])return g[IA];let B=gD({...A,targetWindow:g}),P=D=>{B(D)};return g.addEventListener("message",P),g[IA]={handler:B,dispose(){g.removeEventListener?.("message",P),delete g[IA]}},g[IA]}var rA="__gwrPageProcessRuntimeInstalled__",BD=A=>new Promise((g,B)=>{let P=new Image;P.onload=()=>g(P),P.onerror=B,P.src=A});function Rg({targetWindow:A=globalThis.window||null,logger:g=console}={}){if(!A)return null;if(A[rA])return A[rA];let B=null;async function P(){return B||(B=lA.create().catch(e=>{throw B=null,e})),B}async function D(e,n={}){let c=await P(),r=URL.createObjectURL(e);try{let w=await BD(r),G=await c.removeWatermarkFromImage(w,n);return{processedBlob:await Og(G),processedMeta:G.__watermarkMeta||null}}finally{URL.revokeObjectURL(r)}}async function t(e,n={}){return(await D(e,n)).processedBlob}let o=_g({targetWindow:A,processWatermarkBlob:D,removeWatermarkFromBlob:t,logger:g});return A[rA]={bridge:o,processWatermarkBlob:D,removeWatermarkFromBlob:t,dispose(){o?.dispose?.(),delete A[rA]}},A[rA]}Rg({targetWindow:window,logger:console});})();\n' : "";
  function shouldSkipFrame(targetWindow) {
    if (!targetWindow) {
      return false;
    }
    try {
      return targetWindow.top && targetWindow.top !== targetWindow.self;
    } catch {
      return false;
    }
  }
  function isPreviewReplacementEnabled(targetWindow) {
    try {
      return targetWindow?.localStorage?.getItem("__gwr_enable_preview_replacement__") !== "0";
    } catch {
      return true;
    }
  }
  (async function init() {
    try {
      const targetWindow = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
      if (shouldSkipFrame(targetWindow)) {
        return;
      }
      console.log("[Gemini Watermark Remover] Initializing...");
      const originalPageFetch = typeof unsafeWindow?.fetch === "function" ? unsafeWindow.fetch.bind(unsafeWindow) : null;
      const userscriptRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : globalThis.GM_xmlhttpRequest;
      const previewBlobFetcher = createUserscriptBlobFetcher({
        gmRequest: userscriptRequest,
        fallbackFetch: originalPageFetch
      });
      const processingRuntime = createUserscriptProcessingRuntime({
        workerCode: USERSCRIPT_WORKER_CODE,
        env: globalThis,
        logger: console
      });
      const imageSessionStore = getDefaultImageSessionStore();
      const actionContextResolver = createGeminiActionContextResolver({
        targetWindow,
        imageSessionStore
      });
      let pageProcessClient = null;
      const processPreviewBlobAtBestPath = async (blob, options = {}) => {
        const result = pageProcessClient?.processWatermarkBlob ? await pageProcessClient.processWatermarkBlob(blob, options) : await processingRuntime.processWatermarkBlob(blob, options);
        return result.processedBlob;
      };
      const processClipboardImageBlobAtBestPath = (blob, options = {}) => pageProcessClient?.processWatermarkBlob ? pageProcessClient.processWatermarkBlob(blob, options) : processingRuntime.processWatermarkBlob(blob, options);
      const removeWatermarkFromBestAvailablePath = (blob, options = {}) => pageProcessClient?.removeWatermarkFromBlob ? pageProcessClient.removeWatermarkFromBlob(blob, options) : processingRuntime.removeWatermarkFromBlob(blob, options);
      const handleOriginalAssetDiscovered = (payload = {}) => {
        const sourceUrl = payload.normalizedUrl || payload.discoveredUrl || "";
        const resolvedActionContext = resolveCompatibleActionContextFromPayload(payload);
        const assetIds = resolvedActionContext?.assetIds;
        if (!assetIds || !sourceUrl) return;
        bindOriginalAssetUrlToImages({
          root: targetWindow.document || document,
          assetIds,
          sourceUrl,
          imageSessionStore
        });
      };
      const handleRpcAssetDiscovered = (payload) => {
        handleOriginalAssetDiscovered({
          ...payload,
          normalizedUrl: payload?.discoveredUrl || ""
        });
      };
      const handleActionCriticalFailure = () => {
        showUserNotice(targetWindow, GWR_ORIGINAL_ASSET_REFRESH_MESSAGE);
      };
      const storeProcessedBlobResolved = (payload = {}, {
        slot = "full",
        processedFrom = "processed"
      } = {}) => {
        const resolvedActionContext = resolveCompatibleActionContextFromPayload(payload);
        const processedBlob = payload?.processedBlob instanceof Blob ? payload.processedBlob : null;
        const sessionKey = (typeof resolvedActionContext?.sessionKey === "string" ? resolvedActionContext.sessionKey.trim() : "") || imageSessionStore.getOrCreateByAssetIds(resolvedActionContext?.assetIds);
        const urlApi = targetWindow?.URL || globalThis.URL;
        if (!processedBlob || !sessionKey || typeof urlApi?.createObjectURL !== "function") {
          return;
        }
        const previousObjectUrl = imageSessionStore.getSnapshot(sessionKey)?.derived?.processedSlots?.[slot]?.objectUrl || "";
        const nextObjectUrl = urlApi.createObjectURL(processedBlob);
        if (previousObjectUrl && previousObjectUrl !== nextObjectUrl && typeof urlApi?.revokeObjectURL === "function") {
          urlApi.revokeObjectURL(previousObjectUrl);
        }
        imageSessionStore.updateProcessedResult(sessionKey, {
          slot,
          objectUrl: nextObjectUrl,
          blob: processedBlob,
          blobType: processedBlob.type || "image/png",
          processedFrom
        });
      };
      const handlePreviewBlobResolved = (payload = {}) => {
        const resolvedActionContext = resolveCompatibleActionContextFromPayload(payload);
        const sessionKey = (typeof resolvedActionContext?.sessionKey === "string" ? resolvedActionContext.sessionKey.trim() : "") || imageSessionStore.getOrCreateByAssetIds(resolvedActionContext?.assetIds);
        if (sessionKey && typeof payload?.normalizedUrl === "string" && payload.normalizedUrl.trim()) {
          imageSessionStore.updateSourceSnapshot?.(sessionKey, {
            sourceUrl: payload.normalizedUrl.trim(),
            isPreviewSource: true
          });
        }
        storeProcessedBlobResolved(payload, {
          slot: "preview",
          processedFrom: "request-preview"
        });
        bindProcessedPreviewResultToImages({
          root: targetWindow.document || document,
          sourceUrl: payload?.normalizedUrl || "",
          processedBlob: payload?.processedBlob || null,
          processedMeta: null,
          processedFrom: "request-preview",
          sessionKey,
          assetIds: resolvedActionContext?.assetIds || null,
          imageSessionStore
        });
      };
      const resolvePreviewRequestActionContext = ({ url = "", normalizedUrl = "" } = {}) => {
        const targetUrl = normalizedUrl || url;
        const imageElement = findGeminiImageElementForSourceUrl(targetWindow.document || document, targetUrl);
        return actionContextResolver.resolveActionContext(imageElement, {
          action: "display"
        });
      };
      const handleProcessedBlobResolved = (payload = {}) => {
        const resolvedActionContext = resolveCompatibleActionContextFromPayload(payload);
        storeProcessedBlobResolved(payload, {
          slot: "full",
          processedFrom: resolvedActionContext?.action === "clipboard" ? "original-clipboard" : "original-download"
        });
      };
      const downloadIntentGate = createGeminiDownloadIntentGate({
        targetWindow,
        resolveActionContext: (target) => {
          const intentAction = resolveGeminiActionKind(target) || "clipboard";
          const sessionContext = actionContextResolver.resolveActionContext(target, {
            action: intentAction
          });
          return {
            action: intentAction,
            target,
            assetIds: sessionContext.assetIds,
            sessionKey: sessionContext.sessionKey,
            resource: sessionContext.resource,
            imageElement: sessionContext.imageElement || actionContextResolver.resolveImageElement({
              target,
              assetIds: sessionContext.assetIds
            })
          };
        }
      });
      const downloadRpcFetch = createGeminiDownloadRpcFetchHook({
        originalFetch: targetWindow.fetch.bind(targetWindow),
        getActionContext: () => downloadIntentGate.getRecentActionContext(),
        onOriginalAssetDiscovered: handleRpcAssetDiscovered,
        logger: console
      });
      const previewFetch = createGeminiDownloadFetchHook({
        originalFetch: downloadRpcFetch,
        isTargetUrl: isGeminiDisplayPreviewAssetUrl,
        normalizeUrl: normalizeGoogleusercontentImageUrl,
        getActionContext: resolvePreviewRequestActionContext,
        processBlob: processPreviewBlobAtBestPath,
        shouldProcessRequest: ({ url = "" } = {}) => isGeminiDisplayPreviewAssetUrl(url),
        failOpenOnProcessingError: true,
        onProcessedBlobResolved: handlePreviewBlobResolved,
        logger: console
      });
      installGeminiDownloadRpcXmlHttpRequestHook(targetWindow, {
        getActionContext: () => downloadIntentGate.getRecentActionContext(),
        onOriginalAssetDiscovered: handleRpcAssetDiscovered,
        logger: console
      });
      installGeminiDownloadHook(targetWindow, {
        originalFetch: previewFetch,
        intentGate: downloadIntentGate,
        isTargetUrl: isGeminiOriginalAssetUrl,
        normalizeUrl: normalizeGoogleusercontentImageUrl,
        processBlob: removeWatermarkFromBestAvailablePath,
        onOriginalAssetDiscovered: handleOriginalAssetDiscovered,
        onProcessedBlobResolved: handleProcessedBlobResolved,
        onActionCriticalFailure: handleActionCriticalFailure,
        logger: console
      });
      const disposeClipboardHook = installGeminiClipboardImageHook(targetWindow, {
        getActionContext: () => downloadIntentGate.getRecentActionContext(),
        imageSessionStore,
        onActionCriticalFailure: handleActionCriticalFailure,
        processClipboardImageBlob: (blob, { actionContext } = {}) => processClipboardImageBlobAtBestPath(blob, { actionContext }),
        resolveImageElement: (actionContext) => actionContextResolver.resolveImageElement(actionContext),
        logger: console
      });
      await requestGeminiConversationHistoryBindings({
        targetWindow,
        fetchImpl: targetWindow.fetch.bind(targetWindow),
        onResponseText: async (responseText, { request }) => {
          for (const binding of extractGeminiAssetBindingsFromResponseText(responseText)) {
            handleRpcAssetDiscovered(appendCompatibleActionContext({
              rpcUrl: request?.url || "",
              discoveredUrl: binding.discoveredUrl
            }, {
              assetIds: binding.assetIds
            }));
          }
        },
        logger: console
      });
      await processingRuntime.initialize();
      await installInjectedPageProcessorRuntime({
        targetWindow,
        scriptCode: USERSCRIPT_PAGE_PROCESSOR_CODE,
        logger: console
      });
      pageProcessClient = createPageProcessBridgeClient({
        targetWindow,
        logger: console,
        fallbackProcessWatermarkBlob: processingRuntime.processWatermarkBlob,
        fallbackRemoveWatermarkFromBlob: processingRuntime.removeWatermarkFromBlob
      });
      installUserscriptProcessBridge({
        targetWindow,
        processWatermarkBlob: processingRuntime.processWatermarkBlob,
        removeWatermarkFromBlob: processingRuntime.removeWatermarkFromBlob,
        logger: console
      });
      const pageImageReplacementController = isPreviewReplacementEnabled(targetWindow) ? installPageImageReplacement({
        imageSessionStore,
        logger: console,
        fetchPreviewBlob: previewBlobFetcher,
        processWatermarkBlobImpl: pageProcessClient.processWatermarkBlob,
        removeWatermarkFromBlobImpl: pageProcessClient.removeWatermarkFromBlob
      }) : null;
      window.addEventListener("beforeunload", () => {
        pageImageReplacementController?.dispose?.();
        disposeClipboardHook();
        downloadIntentGate.dispose();
        processingRuntime.dispose("beforeunload");
      });
      console.log("[Gemini Watermark Remover] Ready");
    } catch (error) {
      console.error("[Gemini Watermark Remover] Initialization failed:", error);
    }
  })();
})();
