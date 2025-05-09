"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
var genai_1 = require("@google/genai");
// Initialize Vertex with your Cloud project and location
var ai = new genai_1.GoogleGenAI({
    vertexai: true,
    project: 'yorkshire3d', // Your Google Cloud project ID
    location: 'global' // Using 'global' as per your example for Vertex with @google/genai
});
var modelId = 'gemini-2.5-flash-preview-04-17'; // Renamed for clarity
// Set up generation config
var generationConfig = {
    maxOutputTokens: 8192,
    temperature: 1,
    topP: 0.95,
    // seed: 0, // Optional
    // responseModalities: ["TEXT"], // Optional, often inferred
    safetySettings: [
        {
            category: genai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: genai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: genai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: genai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: genai_1.HarmBlockThreshold.BLOCK_NONE,
        }
    ],
};
function generateContent() {
    return __awaiter(this, void 0, void 0, function () {
        var request, streamingResp, _a, streamingResp_1, streamingResp_1_1, chunk, text, e_1_1;
        var _b, e_1, _c, _d;
        var _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    request = {
                        model: modelId, // Model ID is part of the request
                        contents: [
                            { role: "user", parts: [{ text: "Hi Gemini, tell me a short story about a robot." }] }
                        ],
                        generationConfig: generationConfig, // generationConfig is part of the request
                    };
                    console.log("Sending message to Gemini via @google/genai...");
                    return [4 /*yield*/, ai.models.generateContentStream(request)];
                case 1:
                    streamingResp = _k.sent();
                    _k.label = 2;
                case 2:
                    _k.trys.push([2, 7, 8, 13]);
                    _a = true, streamingResp_1 = __asyncValues(streamingResp);
                    _k.label = 3;
                case 3: return [4 /*yield*/, streamingResp_1.next()];
                case 4:
                    if (!(streamingResp_1_1 = _k.sent(), _b = streamingResp_1_1.done, !_b)) return [3 /*break*/, 6];
                    _d = streamingResp_1_1.value;
                    _a = false;
                    chunk = _d;
                    text = (_j = (_h = (_g = (_f = (_e = chunk.candidates) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.content) === null || _g === void 0 ? void 0 : _g.parts) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.text;
                    if (text) {
                        process.stdout.write(text);
                    }
                    else {
                        // Optional: Log non-text chunks or chunks with unexpected structure for debugging
                        // process.stdout.write(JSON.stringify(chunk) + '\n');
                    }
                    _k.label = 5;
                case 5:
                    _a = true;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 13];
                case 7:
                    e_1_1 = _k.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 13];
                case 8:
                    _k.trys.push([8, , 11, 12]);
                    if (!(!_a && !_b && (_c = streamingResp_1.return))) return [3 /*break*/, 10];
                    return [4 /*yield*/, _c.call(streamingResp_1)];
                case 9:
                    _k.sent();
                    _k.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 12: return [7 /*endfinally*/];
                case 13:
                    process.stdout.write('\n'); // Add a newline at the end for cleaner output
                    return [2 /*return*/];
            }
        });
    });
}
generateContent().catch(function (err) {
    console.error("\nError generating content:", err.message || err);
    if (err.stack) {
        console.error(err.stack);
    }
    process.exit(1);
});
