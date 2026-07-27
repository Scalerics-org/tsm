import type { Context } from "hono";
import type { ApiResponse } from "../../shared/domain";

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json<ApiResponse<T>>({ success: true, data }, status as 200);
}

export function fail(c: Context, error: string, status = 400) {
  return c.json<ApiResponse<never>>({ success: false, error }, status as 400);
}
