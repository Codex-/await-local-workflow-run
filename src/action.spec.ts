import * as core from "@actions/core";
import { ActionConfig, getConfig } from "./action";

describe("Action", () => {
  describe("getConfig", () => {
    // Represent the process.env inputs.
    let mockEnvConfig: any;

    beforeEach(() => {
      mockEnvConfig = {
        token: "secret",
        workflow: "test workflow",
        checkName: "test check",
        timeout_mins: "15",
        poll_interval_ms: "5000",
      };

      jest.spyOn(core, "getInput").mockImplementation((input: string) => {
        switch (input) {
          case "token":
            return mockEnvConfig.token;
          case "workflow":
            return mockEnvConfig.workflow;
          case "check_name":
            return mockEnvConfig.checkName;
          case "timeout_mins":
            return mockEnvConfig.timeout_mins;
          case "poll_interval_ms":
            return mockEnvConfig.poll_interval_ms;
          default:
            throw new Error("invalid input requested");
        }
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should return a valid config", () => {
      const config: ActionConfig = getConfig();

      // Assert that the numbers / types have been properly loaded.
      expect(config.token).toStrictEqual("secret");
      expect(config.workflow).toStrictEqual("test workflow");
      expect(config.checkName).toStrictEqual("test check");
      expect(config.timeoutMins).toStrictEqual(15);
      expect(config.pollIntervalMs).toStrictEqual(5000);
    });

    it("should provide a default run timeout if none is supplied", () => {
      mockEnvConfig.run_timeout_seconds = "";
      const config: ActionConfig = getConfig();

      expect(config.timeoutMins).toStrictEqual(15);
    });

    it("should provide a default polling interval if none is supplied", () => {
      mockEnvConfig.poll_interval_ms = "";
      const config: ActionConfig = getConfig();

      expect(config.pollIntervalMs).toStrictEqual(15000);
    });

    it("should throw if it cannot parse a string into a number", () => {
      mockEnvConfig.poll_interval_ms = "hello";
      expect(() => getConfig()).toThrowError(
        `Unable to parse value: ${mockEnvConfig.poll_interval_ms}`
      );
    });
  });
});
