import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  send: vi.fn(),
  DeleteObjectCommand: class DeleteObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class PutObjectCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  S3Client: class S3Client {
    constructor(input: unknown) {
      aws.clientConfigs.push(input);
    }

    send = aws.send;
  }
}));

vi.mock("@aws-sdk/client-s3", () => aws);

async function loadR2() {
  vi.resetModules();
  process.env.CLOUDFLARE_R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
  process.env.CLOUDFLARE_R2_BUCKET = "foodphoto";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "access-key";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "secret-key";
  process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = "https://pub.example.test/";

  return import("./r2");
}

beforeEach(() => {
  aws.clientConfigs.length = 0;
  aws.send.mockReset().mockResolvedValue({});
});

describe("R2 storage adapter behavior", () => {
  it("creates stable per-user photo object keys", async () => {
    const { createPhotoKey } = await loadR2();

    expect(createPhotoKey("user-1", "entry-1", "jpg")).toBe("users/user-1/entries/entry-1.jpg");
  });

  it("builds public photo URLs without leaking a double slash from env configuration", async () => {
    const { publicPhotoUrl } = await loadR2();

    expect(publicPhotoUrl("users/user-1/entries/entry-1.jpg")).toBe(
      "https://pub.example.test/users/user-1/entries/entry-1.jpg"
    );
  });

  it("uploads photos with the app bucket, content type, and immutable browser cache policy", async () => {
    const { putPhotoObject } = await loadR2();
    const body = Buffer.from("photo");

    await putPhotoObject({
      key: "users/user-1/entries/entry-1.jpg",
      body,
      contentType: "image/jpeg"
    });

    expect(aws.clientConfigs).toEqual([
      {
        region: "auto",
        endpoint: "https://account.r2.cloudflarestorage.com",
        credentials: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key"
        }
      }
    ]);
    expect(aws.send).toHaveBeenCalledTimes(1);
    expect(aws.send.mock.calls[0][0].input).toEqual({
      Bucket: "foodphoto",
      Key: "users/user-1/entries/entry-1.jpg",
      Body: body,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable"
    });
  });

  it("deletes the exact object key from the app bucket", async () => {
    const { deletePhotoObject } = await loadR2();

    await deletePhotoObject("users/user-1/entries/entry-1.jpg");

    expect(aws.send).toHaveBeenCalledTimes(1);
    expect(aws.send.mock.calls[0][0].input).toEqual({
      Bucket: "foodphoto",
      Key: "users/user-1/entries/entry-1.jpg"
    });
  });

  it("fails fast when public URL configuration is absent", async () => {
    vi.resetModules();
    delete process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
    const { publicPhotoUrl } = await import("./r2");

    expect(() => publicPhotoUrl("users/user-1/entries/entry-1.jpg")).toThrow(
      "CLOUDFLARE_R2_PUBLIC_BASE_URL is not configured."
    );
  });
});
