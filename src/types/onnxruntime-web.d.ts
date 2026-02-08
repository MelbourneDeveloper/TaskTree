/** onnxruntime-web types exist but its package.json exports map is broken. */
declare module 'onnxruntime-web' {
    export const InferenceSession: unknown;
    export const Tensor: unknown;
    export const env: unknown;
}
