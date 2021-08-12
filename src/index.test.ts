///<reference path="../../Library/Caches/JetBrains/WebStorm2021.1/javascript/typings/jest/27.0.0/node_modules/@types/jest/index.d.ts"/>
const run = require('.');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const {ImageRepositoryType, UpdateServiceCommand, DescribeServiceCommand} = require("@aws-sdk/client-apprunner");

jest.mock('@actions/core');
jest.mock('fs');

const mockSendDef = jest.fn();
const mockListDef = jest.fn();
const SERVICE_ID = "serviceId";
const SERVICE_NAME = "serviceName";
const SERVICE_ARN = "serviceArn";
const SOURCE_ARN_CONNECTION = "sourceArnConnection";
const ACCESS_ROLE_ARN = "accessRoleArn";
const REPO = "repo";
const DOCKER_IMAGE = "public.ecr.aws/bitnami/node:latest";
const RUNTIME = "NODEJS_12";
const BUILD_COMMAND = "build-command";
const START_COMMAND = "start-command";
const PORT = "80";

jest.mock('@aws-sdk/client-apprunner', () => {
    return {
        config: {
            region: 'fake-region'
        },
        AppRunnerClient: jest.fn(() => ({
            send: mockSendDef
        })),
        ListServicesCommand: jest.fn(),
        CreateServiceCommand: jest.fn(() => {
            return {
                input: {}
            }
        }),
        UpdateServiceCommand: jest.fn(),
        DescribeServiceCommand: jest.fn(),
        ImageRepositoryType: {
            ECR: "ECR",
            ECR_PUBLIC: "ECR_PUBLIC",
        }
    };
});

describe('Deploy to AppRunner', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = Object.assign(process.env, {GITHUB_WORKSPACE: __dirname});
    });

    test('register app runner with source code configuration', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(RUNTIME)
            .mockReturnValueOnce(BUILD_COMMAND)
            .mockReturnValueOnce(START_COMMAND)
            .mockReturnValueOnce(PORT)
            .mockReturnValueOnce('false');
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: null
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    ServiceId: SERVICE_ID
                }
            }
        });
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(core.info).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('register app runner using docker registry configuration', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(DOCKER_IMAGE);
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: null
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    ServiceId: SERVICE_ID
                }
            }
        });
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(core.info).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('update app runner', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(DOCKER_IMAGE);
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: null,
                ServiceSummaryList: [
                    {
                        ServiceName: SERVICE_NAME,
                        ServiceArn: SERVICE_ARN
                    }
                ]
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    ServiceId: SERVICE_ID
                }
            }
        });
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(core.info).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('update app runner with pagination', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(DOCKER_IMAGE);
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: "NextToken"
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: null,
                ServiceSummaryList: [
                    {
                        ServiceName: SERVICE_NAME,
                        ServiceArn: SERVICE_ARN
                    }
                ]
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    ServiceId: SERVICE_ID
                }
            }
        });
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(core.info).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('register app and wait for stable state', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(RUNTIME)
            .mockReturnValueOnce(BUILD_COMMAND)
            .mockReturnValueOnce(START_COMMAND)
            .mockReturnValueOnce(PORT)
            .mockReturnValueOnce('true');
        mockSendDef.mockImplementationOnce(() => {
            return {
                NextToken: null
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    ServiceId: SERVICE_ID,
                    ServiceArn: SERVICE_ARN
                }
            }
        });
        mockSendDef.mockImplementationOnce(() => {
            return {
                Service: {
                    Status: "CREATION_COMPLETE"
                }
            }
        });

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(core.info).toBeCalledWith(`Waiting for the service ${SERVICE_ID} to reach stable state`);
        expect(core.info).toBeCalledWith(`Service ${SERVICE_ID} has reached the stable state CREATION_COMPLETE`);
    });

    test('Validation - Service name empty', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(DOCKER_IMAGE)

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });

    test('Validation - Docker and source code configuration', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(null)

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });

    test('Validation - Source code missing validation', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(RUNTIME)
            .mockReturnValueOnce(BUILD_COMMAND)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(PORT)
            .mockReturnValueOnce('true');

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });

    test('Validation - Invalid runtime', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce("RUNTIME")
            .mockReturnValueOnce(BUILD_COMMAND)
            .mockReturnValueOnce(START_COMMAND)
            .mockReturnValueOnce(PORT)
            .mockReturnValueOnce('true');

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });

    test('Validation - IAM Role missing', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(DOCKER_IMAGE)

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });

    test('register app runner with branch configuration', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce(SERVICE_NAME)
            .mockReturnValueOnce(SOURCE_ARN_CONNECTION)
            .mockReturnValueOnce(ACCESS_ROLE_ARN)
            .mockReturnValueOnce(REPO)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(RUNTIME)
            .mockReturnValueOnce(BUILD_COMMAND)
            .mockReturnValueOnce(START_COMMAND)
            .mockReturnValueOnce(PORT)
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('us-east-1')
            .mockReturnValueOnce('refs/head/master')
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(1);
    });
});
