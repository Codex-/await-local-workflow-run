import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  getCheckId,
  getRunState,
  getRunStatus,
  getWorkflowId,
  getWorkflowRun,
  getWorkflowRuns,
  init,
  resetGetWorkflowRunCfg,
  RunConclusion,
  RunStatus,
  RunType,
} from "./api";

interface MockResponse {
  data: any;
  status: number;
}

const mockOctokit = {
  rest: {
    checks: {
      get: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listForSuite: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
    actions: {
      getWorkflowRun: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listRepoWorkflows: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listWorkflowRuns: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
};

describe("API", () => {
  const mockBranchName = "lanayru";
  const mockRef = `refs/heads/${mockBranchName}`;
  const mockSha = "1234567890123456789012345678901234567890";

  beforeEach(() => {
    jest.spyOn(core, "getInput").mockReturnValue("");
    jest.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    jest.spyOn(github.context, "repo", "get").mockImplementation(() => {
      return {
        owner: "rich-clown",
        repo: "circus",
      };
    });
    github.context.ref = mockRef;
    github.context.sha = mockSha;

    init();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getWorkflowId", () => {
    const mockData = {
      total_count: 3,
      workflows: [
        {
          id: 0,
          path: ".github/workflows/cake.yml",
        },
        {
          id: 1,
          path: ".github/workflows/pie.yml",
        },
        {
          id: 2,
          path: ".github/workflows/slice.yml",
        },
      ],
    };

    it("should return the workflow ID for a given workflow filename", async () => {
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        })
      );

      expect(await getWorkflowId("slice.yml")).toStrictEqual(
        mockData.workflows[2].id
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        })
      );

      await expect(getWorkflowId("implode")).rejects.toThrow(
        `Failed to get Workflows, expected 200 but received ${errorStatus}`
      );
    });

    it("should throw if a given workflow name cannot be found in the response", async () => {
      const workflowName = "spoon";
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        })
      );

      await expect(getWorkflowId(workflowName)).rejects.toThrow(
        `Failed to get Workflow ID for '${workflowName}', available workflows: [${mockData.workflows.map(
          (workflow) =>
            `${workflow.path.replace(/\.github\/workflows\//i, "")} (${
              workflow.id
            })`
        )}]`
      );
    });

    it("should throw if the response returns no workflows", async () => {
      const workflowName = "slice";
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: 0,
            workflows: [],
          },
          status: 200,
        })
      );

      await expect(getWorkflowId(workflowName)).rejects.toThrow(
        `Failed to get Workflow ID for '${workflowName}', available workflows: []`
      );
    });
  });

  describe("getWorkflowRun", () => {
    beforeEach(() => {
      resetGetWorkflowRunCfg();
    });

    it("should return a run ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "1234567890123456789012345678901234567890",
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockWorkflowRunsApiData.length,
            workflow_runs: mockWorkflowRunsApiData,
          },
          status: 200,
        })
      );
      const run = await getWorkflowRun(0);

      expect(run).toStrictEqual({
        id: mockWorkflowRunsApiData[0].id,
        attempt: mockWorkflowRunsApiData[0].run_attempt,
        checkSuiteId: mockWorkflowRunsApiData[0].check_suite_id,
        status: mockWorkflowRunsApiData[0].status,
      });
    });

    it("should return undefined if it cannot find an ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "0", // different sha
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockWorkflowRunsApiData.length,
            workflow_runs: mockWorkflowRunsApiData,
          },
          status: 200,
        })
      );
      const run = await getWorkflowRun(0);

      expect(run).toBeUndefined();
    });

    it("should change to use the branch strategy if no runs are returned for a given ID", async () => {
      const mockWorkflowRunsApiData = [
        {
          id: 123456,
          check_suite_id: 654321,
          head_sha: "1234567890123456789012345678901234567890",
          run_attempt: 1,
          status: RunStatus.InProgress,
        },
      ];
      const listWorkflowRunsSpy = jest
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValueOnce(
          Promise.resolve({
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          })
        )
        .mockReturnValueOnce(
          Promise.resolve({
            data: {
              total_count: mockWorkflowRunsApiData.length,
              workflow_runs: mockWorkflowRunsApiData,
            },
            status: 200,
          })
        );

      expect(await getWorkflowRun(0)).toBeUndefined();
      expect(Object.keys(listWorkflowRunsSpy.mock.calls[0][0])).not.toContain(
        "branch"
      );
      expect(await getWorkflowRun(0)).toStrictEqual({
        id: mockWorkflowRunsApiData[0].id,
        attempt: mockWorkflowRunsApiData[0].run_attempt,
        checkSuiteId: mockWorkflowRunsApiData[0].check_suite_id,
        status: mockWorkflowRunsApiData[0].status,
      });
      expect(Object.keys(listWorkflowRunsSpy.mock.calls[1][0])).toContain(
        "branch"
      );
    });
  });

  describe("getWorkflowRuns", () => {
    const mockWorkflowRunsApiData = [
      {
        id: 0,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 1,
        status: RunStatus.Completed,
      },
      {
        id: 1,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 0,
        status: RunStatus.Completed,
      },
      {
        id: 2,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 2,
        status: RunStatus.Completed,
      },
      {
        id: 3,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 3,
        status: RunStatus.Completed,
      },
      {
        id: 4,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 1,
        status: RunStatus.Completed,
      },
      {
        id: 9,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 3,
        status: RunStatus.Queued,
      },
      {
        id: 5,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 4,
        status: RunStatus.Completed,
      },
      {
        id: 6,
        head_sha: "0",
        run_attempt: 5,
        status: RunStatus.Completed,
      },
      {
        id: 7,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 2,
        status: RunStatus.InProgress,
      },
      {
        id: 8,
        check_suite_id: 0,
        head_sha: "0",
        run_attempt: 6,
        status: RunStatus.Completed,
      },
      {
        id: 9,
        check_suite_id: 0,
        head_sha: mockSha,
        run_attempt: 2,
        status: RunStatus.Queued,
      },
    ];
    const mockData = {
      total_count: mockWorkflowRunsApiData.length,
      workflow_runs: mockWorkflowRunsApiData,
    };

    let listWorkflowRunsSpy: jest.SpyInstance<
      Promise<MockResponse>,
      [_req?: any]
    >;

    beforeEach(() => {
      listWorkflowRunsSpy = jest
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it("should get the run IDs for a given workflow ID filtered by the commit sha", async () => {
      const workflowRuns = await getWorkflowRuns(0);

      expect(workflowRuns).toHaveLength(
        mockWorkflowRunsApiData.filter(
          (workflow) => workflow.head_sha === mockSha
        ).length
      );
    });

    it("should have the highest run attempt first", async () => {
      const runAttempt = mockWorkflowRunsApiData
        .filter((workflow) => workflow.head_sha === mockSha)
        .reduce((previousValue, currentValue) => {
          return previousValue > currentValue.run_attempt
            ? previousValue
            : currentValue.run_attempt;
        }, 0);

      const workflowRuns = await getWorkflowRuns(0);

      expect(workflowRuns[0].attempt).toStrictEqual(runAttempt);
    });

    it("should return the runs in attempt order", async () => {
      const runAttempts = mockWorkflowRunsApiData
        .filter((workflow) => workflow.head_sha === mockSha)
        .sort((a, b) => {
          if (a.run_attempt > b.run_attempt) {
            return -1;
          }
          if (a.run_attempt < b.run_attempt) {
            return 1;
          }

          return 0;
        });

      const workflowRuns = await getWorkflowRuns(0);

      expect(workflowRuns).toHaveLength(runAttempts.length);
      // eslint-disable-next-line github/array-foreach
      runAttempts.forEach((attempt, i) => {
        const workflowRun = workflowRuns[i];
        expect(workflowRun.attempt).toStrictEqual(attempt.run_attempt);
        expect(workflowRun.checkSuiteId).toStrictEqual(attempt.check_suite_id);
        expect(workflowRun.id).toStrictEqual(attempt.id);
        expect(workflowRun.status).toStrictEqual(attempt.status);
      });
    });

    it("should return runs in the correct shape", async () => {
      const workflowRun = (await getWorkflowRuns(0))[0];

      expect(typeof workflowRun.attempt).toStrictEqual("number");
      expect(typeof workflowRun.checkSuiteId).toStrictEqual("number");
      expect(typeof workflowRun.id).toStrictEqual("number");
      expect(typeof workflowRun.status).toStrictEqual("string");
    });

    it("should not try to use the branch name by default", async () => {
      (await getWorkflowRuns(0))[0];
      const requestObj = listWorkflowRunsSpy.mock.calls[0][0];

      expect(requestObj.branch).toBeUndefined();
    });

    it("should use the branch name for the request if tryBranchName is true", async () => {
      (await getWorkflowRuns(0, true))[0];
      const requestObj = listWorkflowRunsSpy.mock.calls[0][0];

      expect(requestObj.branch).toStrictEqual(mockBranchName);
    });

    it("should use the created field if the branch name is not being used", async () => {
      (await getWorkflowRuns(0))[0];

      const requestObj = listWorkflowRunsSpy.mock.calls[0][0];
      expect(requestObj.created).toBeDefined();
      expect(typeof requestObj.created).toStrictEqual("string");
      expect(requestObj.created !== "").toBeTruthy();
    });

    it("should exclude the created field if the branch name is being used", async () => {
      (await getWorkflowRuns(0, true))[0];
      const requestObj = listWorkflowRunsSpy.mock.calls[0][0];

      expect(requestObj.created).toBeUndefined();
    });

    it("should return no runs if there are no sha matches", async () => {
      github.context.sha = "ganon";

      const workflowRuns = await getWorkflowRuns(0);

      expect(workflowRuns).toHaveLength(0);
    });

    it("should throw if a non-200 status is returned", async () => {
      listWorkflowRunsSpy.mockRestore();
      const errorStatus = 401;
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        })
      );

      await expect(getWorkflowRuns(0)).rejects.toThrow(
        `Failed to get Workflow runs, expected 200 but received ${errorStatus}`
      );
    });

    it("should return an empty array if there are no runs", async () => {
      listWorkflowRunsSpy.mockRestore();

      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: 0,
            workflow_runs: [],
          },
          status: 200,
        })
      );

      expect(await getWorkflowRuns(0)).toStrictEqual([]);
    });

    it("should not use the branch field if the ref is for a tag", async () => {
      github.context.ref = "/refs/tags/1.5.0";
      (await getWorkflowRuns(0, true))[0];
      const requestObj = listWorkflowRunsSpy.mock.calls[0][0];

      expect(requestObj.branch).toBeUndefined();
    });
  });

  describe("getCheckId", () => {
    it("should return a run ID", async () => {
      const mockCheckRunsApiData = [
        {
          id: 123456,
          name: "ganon",
        },
      ];
      jest.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockCheckRunsApiData.length,
            check_runs: mockCheckRunsApiData,
          },
          status: 200,
        })
      );
      const runID = await getCheckId(0, "ganon");

      expect(runID).toStrictEqual(123456);
    });

    it("should throw an error if it cannot locate the requested check name", async () => {
      const mockCheckRunsApiData = [
        {
          id: 123456,
          name: "ganon",
        },
      ];
      jest.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: mockCheckRunsApiData.length,
            check_runs: mockCheckRunsApiData,
          },
          status: 200,
        })
      );

      await expect(() => getCheckId(0, "link")).rejects.toThrowError(
        "Failed to get Check ID for 'link', available checks: [ganon (123456)]"
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      jest.spyOn(mockOctokit.rest.checks, "listForSuite").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        })
      );

      await expect(getCheckId(0, "")).rejects.toThrow(
        `Failed to get Checks, expected 200 but received ${errorStatus}`
      );
    });
  });

  describe("getRunState", () => {
    it("should throw if an unknown run type is specified", async () => {
      await expect(() => getRunState(123456, -1)).rejects.toThrowError(
        "Unknown run type specified"
      );
    });

    describe("workflow", () => {
      it("should return the run state for a given run ID", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const state = await getRunState(123456, RunType.WorkflowRun);
        expect(state.conclusion).toStrictEqual(mockData.conclusion);
        expect(state.status).toStrictEqual(mockData.status);
      });

      it("should throw if a non-200 status is returned", async () => {
        const errorStatus = 401;
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          })
        );

        await expect(getRunState(0, RunType.WorkflowRun)).rejects.toThrow(
          `Failed to get run state, expected 200 but received ${errorStatus}`
        );
      });
    });

    describe("check", () => {
      it("should return the run state for a given run ID", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const state = await getRunState(123456, RunType.WorkflowRun);
        expect(state.conclusion).toStrictEqual(mockData.conclusion);
        expect(state.status).toStrictEqual(mockData.status);
      });

      it("should throw if a non-200 status is returned", async () => {
        const errorStatus = 401;
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          })
        );

        await expect(getRunState(0, RunType.WorkflowRun)).rejects.toThrow(
          `Failed to get run state, expected 200 but received ${errorStatus}`
        );
      });
    });
  });

  describe("getRunStatus", () => {
    describe("workflow", () => {
      it("should return the conclusion when completed", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const runStatus = await getRunStatus(0, RunType.WorkflowRun);

        expect(runStatus.completed).toBeTruthy();
        if (runStatus.completed) {
          expect(runStatus.conclusion).toStrictEqual(RunConclusion.Cancelled);
        } else {
          throw new Error("should be completed");
        }
      });

      it("should not set a failure status if the conclusion is a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Success,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy).not.toBeCalled();
      });

      it("should set the status to non-success when the conclusion is not a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Failure,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy.mock.calls[0][0]).toStrictEqual(
          RunConclusion.Failure
        );
      });

      it("should set the status to non-success when the conclusion is unknown", async () => {
        const unknownStatus = "Clown Car?";
        const mockData = {
          status: RunStatus.Completed,
          conclusion: unknownStatus,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.WorkflowRun);

        expect(coreSetFailedSpy.mock.calls[0][0]).toStrictEqual(
          `Unknown conclusion: ${unknownStatus}`
        );
      });

      it("should return with completed set to false when not completed", async () => {
        const mockData = {
          status: RunStatus.Queued,
        };
        jest.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const runStatus = await getRunStatus(0, RunType.WorkflowRun);

        expect(runStatus.completed).toBeFalsy();
        if (runStatus.completed) {
          throw new Error("should be not be completed");
        }
      });
    });

    describe("check", () => {
      it("should return the conclusion when completed", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Cancelled,
        };
        jest.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const runStatus = await getRunStatus(0, RunType.CheckRun);

        expect(runStatus.completed).toBeTruthy();
        if (runStatus.completed) {
          expect(runStatus.conclusion).toStrictEqual(RunConclusion.Cancelled);
        } else {
          throw new Error("should be completed");
        }
      });

      it("should not set a failure status if the conclusion is a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Success,
        };
        jest.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy).not.toBeCalled();
      });

      it("should set the status to non-success when the conclusion is not a success", async () => {
        const mockData = {
          status: RunStatus.Completed,
          conclusion: RunConclusion.Failure,
        };
        jest.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy.mock.calls[0][0]).toStrictEqual(
          RunConclusion.Failure
        );
      });

      it("should set the status to non-success when the conclusion is unknown", async () => {
        const unknownStatus = "Clown Car?";
        const mockData = {
          status: RunStatus.Completed,
          conclusion: unknownStatus,
        };
        jest.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );
        const coreSetFailedSpy = jest
          .spyOn(core, "setFailed")
          .mockImplementation();

        await getRunStatus(0, RunType.CheckRun);

        expect(coreSetFailedSpy.mock.calls[0][0]).toStrictEqual(
          `Unknown conclusion: ${unknownStatus}`
        );
      });

      it("should return with completed set to false when not completed", async () => {
        const mockData = {
          status: RunStatus.Queued,
        };
        jest.spyOn(mockOctokit.rest.checks, "get").mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200,
          })
        );

        const runStatus = await getRunStatus(0, RunType.CheckRun);

        expect(runStatus.completed).toBeFalsy();
        if (runStatus.completed) {
          throw new Error("should be not be completed");
        }
      });
    });
  });
});
