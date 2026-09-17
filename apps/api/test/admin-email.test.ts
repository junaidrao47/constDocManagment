import request from "supertest";
import { UserRole } from "../src/modules/users/user.entity";
import { bearer, mintToken, resetTestState, seedUser, testApp } from "./support/harness";

beforeEach(() => resetTestState());

describe("admin transactional email trigger", () => {
  it("accepts a validated email request for an admin", async () => {
    const admin = await seedUser({ role: UserRole.Admin });

    const response = await request(testApp())
      .post("/api/admin/notifications/email")
      .set("Authorization", bearer(mintToken(admin)))
      .send({
        to: "contacto@grupog2h.com",
        subject: "SES application test",
        text: "Transactional email path is working.",
        html: "<p>Transactional email path is working.</p>",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.transport).toBe("log");
    expect(response.body.data.delivered).toBe(true);
  });

  it("rejects the trigger for an agent", async () => {
    const agent = await seedUser({ role: UserRole.Agent });

    const response = await request(testApp())
      .post("/api/admin/notifications/email")
      .set("Authorization", bearer(mintToken(agent)))
      .send({ to: "contacto@grupog2h.com", subject: "Blocked", text: "Blocked" });

    expect(response.status).toBe(403);
  });
});