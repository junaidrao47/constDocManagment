export function successResponse<T>(data: T, message = "ok") {
  return { success: true, data, message };
}
