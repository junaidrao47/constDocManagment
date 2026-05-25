export const authService = {
  register: () => ({ accessToken: "", refreshToken: "" }),
  login: () => ({ accessToken: "", refreshToken: "" }),
  refresh: () => ({ accessToken: "" }),
  logout: () => ({ revoked: true }),
  forgotPassword: () => ({ sent: true }),
  resetPassword: () => ({ reset: true }),
};
