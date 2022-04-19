import * as core from "@actions/core";
import * as github from "@actions/github";
import { getWorkflowId, init } from "./api";

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
    },
  },
};

describe("API", () => {
  beforeEach(() => {
    jest.spyOn(core, "getInput").mockReturnValue("");
    jest.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    jest.spyOn(github.context, "repo", "get").mockImplementation(() => {
      return {
        owner: "rich-clown",
        repo: "circus",
      };
    });

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
});
