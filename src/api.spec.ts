import * as core from "@actions/core";
import * as github from "@actions/github";
import { getWorkflowId, getWorkflowRuns, init, WorkflowRunStatus } from "./api";

interface MockResponse {
  data: any;
  status: number;
}

const mockOctokit = {
  rest: {
    actions: {
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

  describe("getWorkflowRuns", () => {
    const mockWorkflowRunsApiData = [
      {
        id: 0,
        head_sha: "0",
        run_attempt: 1,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 1,
        head_sha: mockSha,
        run_attempt: 0,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 2,
        head_sha: "0",
        run_attempt: 2,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 3,
        head_sha: "0",
        run_attempt: 3,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 4,
        head_sha: mockSha,
        run_attempt: 1,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 9,
        head_sha: mockSha,
        run_attempt: 3,
        status: WorkflowRunStatus.Queued,
      },
      {
        id: 5,
        head_sha: "0",
        run_attempt: 4,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 6,
        head_sha: "0",
        run_attempt: 5,
        status: WorkflowRunStatus.Completed,
      },
      {
        id: 7,
        head_sha: mockSha,
        run_attempt: 2,
        status: WorkflowRunStatus.InProgress,
      },
      {
        id: 8,
        head_sha: "0",
        run_attempt: 6,
        status: WorkflowRunStatus.Completed,
      },
    ];
    const mockData = {
      total_count: mockWorkflowRunsApiData.length,
      workflow_runs: mockWorkflowRunsApiData,
    };

    // const workflowIdCfg = {
    //   token: "secret",
    //   workflowName: "workflow_name",
    //   workflowInputs: {},
    //   workflowTimeoutSeconds: 60,
    // };

    // beforeEach(() => {
    //   init(workflowIdCfg);
    // });

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
        expect(workflowRun.id).toStrictEqual(attempt.id);
        expect(workflowRun.status).toStrictEqual(attempt.status);
      });
    });

    it("should return runs in the correct shape", async () => {
      const workflowRun = (await getWorkflowRuns(0))[0];

      expect(typeof workflowRun.attempt).toStrictEqual("number");
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
});
