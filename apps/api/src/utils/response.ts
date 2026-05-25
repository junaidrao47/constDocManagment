export function successResponse<T>(data: T, message = "ok") {
  return { success: true, data, message };
}

export function errorResponse(error: string, code = 500) {
  return { success: false, error, code };
}
