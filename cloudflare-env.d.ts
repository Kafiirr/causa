declare namespace Cloudflare {
  interface Env {
    MODEL_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
