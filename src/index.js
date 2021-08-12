const core = require('@actions/core');
const {
    AppRunnerClient,
    CreateServiceCommand,
    ListServicesCommand,
    ImageRepositoryType,
    UpdateServiceCommand,
    DescribeServiceCommand
} = require("@aws-sdk/client-apprunner");

const NODEJS_12 = "NODEJS_12";
const PYTHON_3 = "PYTHON_3";
const OPERATION_IN_PROGRESS = "OPERATION_IN_PROGRESS";
const MAX_ATTEMPTS = 120;

function isEmptyValue(value) {
    return value === null || value === undefined || value === '';
}

// Wait in milliseconds (helps to implement exponential retries)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Determine ECR image repository type
function getImageType(imageUri) {
    return imageUri.startsWith("public.ecr") ? ImageRepositoryType.ECR_PUBLIC : ImageRepositoryType.ECR
}

async function run() {
    const serviceName = core.getInput('service', {required: true});
    const sourceConnectionArn = core.getInput('source-connection-arn', {required: false});
    const accessRoleArn = core.getInput('access-role-arn', {required: false});
    const repoUrl = core.getInput('repo', {required: false});
    const imageUri = core.getInput('image', {required: false});
    const runtime = core.getInput('runtime', {required: true});
    const buildCommand = core.getInput('build-command', {required: false});
    const startCommand = core.getInput('start-command', {required: false});
    const port = core.getInput('port', {required: false}) || 80;
    const waitForService = core.getInput('wait-for-service-stability', {required: false}) || "false";

    try {
        // Check for service type
        const isImageBased = !isEmptyValue(imageUri);

        // Validations - AppRunner Service name
        if (isEmptyValue(serviceName))
            throw new Error('AppRunner service name cannot be empty');

        // Image URI required if the service is docker registry based
        if (isImageBased && !isEmptyValue(repoUrl))
            throw new Error('Either docker image registry or code repository expected, not both');

        // Mandatory check for source code based AppRunner
        if (!isImageBased) {
            if (isEmptyValue(sourceConnectionArn) || isEmptyValue(repoUrl) || isEmptyValue(runtime)
                || isEmptyValue(buildCommand)
                || isEmptyValue(startCommand))
                throw new Error('Connection ARN, Repository URL, Runtime, build and start command are expected');


            // Runtime enum check
            if (runtime !== NODEJS_12 && runtime !== PYTHON_3)
                throw new Error(`Unexpected value passed in runtime ${runtime} only supported values are ${NODEJS_12} and ${PYTHON_3}`);
        }else{
            // IAM Role check for ECR based AppRunner
            if (isEmptyValue(accessRoleArn))
                throw new Error(`Access role ARN is required for ECR based AppRunner`);
        }

        // Defaults
        // Region - us-east-1
        let region = core.getInput('region', {required: false});
        region = region ? region : 'us-east-1';

        // Branch - master
        let branch = core.getInput('branch', {required: false});
        branch = branch ? branch : 'master';

        // Get branch details from refs
        if (branch.startsWith("refs/")) {
            branch = branch.split("/")[2];
        }

        // CPU - 1
        let cpu = core.getInput('cpu', {required: false});
        cpu = cpu ? cpu : 1;

        // Memory - 3
        let memory = core.getInput('memory', {required: false});
        memory = memory ? memory : 3;

        // AppRunner client
        const client = new AppRunnerClient({region: region});

        // Check whether service exists and get ServiceArn
        let nextToken = null;
        let serviceArn = null;
        do {
            const listServiceResponse = await client.send(
                new ListServicesCommand({
                    NextToken: nextToken
                })
            );

            // Run through pagination and check for service name match
            nextToken = listServiceResponse.NextToken;
            for (const s in listServiceResponse.ServiceSummaryList) {
                const service = listServiceResponse.ServiceSummaryList[s];
                if (service.ServiceName === serviceName) {
                    serviceArn = service.ServiceArn
                    nextToken = null;
                    break;
                }
            }
        } while (!isEmptyValue(nextToken))

        // New service or update to existing service
        let serviceId = "";
        if (isEmptyValue(serviceArn)) {
            core.info(`Creating service ${serviceName}`);
            const command = new CreateServiceCommand({
                ServiceName: serviceName,
                InstanceConfiguration: {
                    CPU: cpu + " vCPU",
                    Memory: memory + " GB"
                },
                SourceConfiguration: {}
            });
            if (isImageBased) {
                // Image based set docker registry details
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        AccessRoleArn: accessRoleArn
                    },
                    ImageRepository: {
                        ImageIdentifier: imageUri,
                        ImageRepositoryType: getImageType(imageUri)
                    }
                };
            } else {
                // Source code based set source code details
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        ConnectionArn: sourceConnectionArn
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: repoUrl,
                        SourceCodeVersion: {
                            Type: "BRANCH",
                            Value: branch
                        },
                        CodeConfiguration: {
                            ConfigurationSource: "API",
                            CodeConfigurationValues: {
                                Runtime: runtime,
                                BuildCommand: buildCommand,
                                StartCommand: startCommand,
                                Port: port
                            }
                        }
                    }
                };
            }
            const createServiceResponse = await client.send(command);
            serviceId = createServiceResponse.Service.ServiceId;
            core.info(`Service creation initiated with service ID - ${serviceId}`)
            serviceArn = createServiceResponse.Service.ServiceArn;
        } else {
            core.info(`Updating existing service ${serviceName}`);
            if (isImageBased) {
                // Update only in case of docker registry based service
                const updateServiceResponse = await client.send(new UpdateServiceCommand({
                    ServiceArn: serviceArn,
                    SourceConfiguration: {
                        AuthenticationConfiguration: {
                            AccessRoleArn: accessRoleArn
                        },
                        ImageRepository: {
                            ImageIdentifier: imageUri,
                            ImageRepositoryType: getImageType(imageUri)
                        }
                    }
                }));

                serviceId = updateServiceResponse.Service.ServiceId;
                core.info(`Service update initiated with operation ID - ${serviceId}`);
                serviceArn = updateServiceResponse.Service.ServiceArn;
            }
        }

        // Set output
        core.setOutput('service-id', serviceId);

        // Wait for service to be stable (if required)
        if (waitForService === "true") {
            let attempts = 0;
            let status = OPERATION_IN_PROGRESS;
            core.info(`Waiting for the service ${serviceId} to reach stable state`);
            while (status === OPERATION_IN_PROGRESS && attempts < MAX_ATTEMPTS) {
                const describeServiceResponse = await client.send(new DescribeServiceCommand({
                    ServiceArn: serviceArn
                }));

                status = describeServiceResponse.Service.Status;
                if (status !== OPERATION_IN_PROGRESS)
                    break;

                // Wait for 5 seconds and re-try
                await sleep(5000);
                attempts++;
            }

            // Throw error if service has not reached an end state
            if (attempts >= MAX_ATTEMPTS)
                throw new Error(`Service did not reach stable state after ${attempts} attempts`);
            else
                core.info(`Service ${serviceId} has reached the stable state ${status}`);
        }else{
            core.info(`Service ${serviceId} has started creation. Watch for creation progress in AppRunner console`);
        }
    } catch (error) {
        core.setFailed(error.message);
        core.debug(error.stack);
    }
}

module.exports = run;

if (require.main === module) {
    run();
}
