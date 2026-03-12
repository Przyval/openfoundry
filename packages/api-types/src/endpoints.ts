/**
 * Endpoint descriptors for all OpenFoundry API endpoints.
 *
 * Each descriptor is a tuple: [method, path, hasBody, needsAuth, needsPreview]
 */

export type EndpointDescriptor = [
  method: string,
  path: string,
  hasBody: boolean,
  needsAuth: boolean,
  needsPreview: boolean,
];

// ---------------------------------------------------------------------------
// Ontology Service
// ---------------------------------------------------------------------------

export const listOntologies: EndpointDescriptor = ["GET", "/api/v2/ontologies", false, true, false];
export const createOntology: EndpointDescriptor = ["POST", "/api/v2/ontologies", true, true, false];
export const getOntology: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}", false, true, false];
export const deleteOntology: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}", false, true, false];

export const listObjectTypes: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objectTypes", false, true, false];
export const createObjectType: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/objectTypes", true, true, false];
export const getObjectType: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}", false, true, false];
export const updateObjectType: EndpointDescriptor = ["PUT", "/api/v2/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}", true, true, false];
export const deleteObjectType: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}", false, true, false];

export const listActionTypes: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/actionTypes", false, true, false];
export const createActionType: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/actionTypes", true, true, false];
export const getActionType: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/actionTypes/{actionTypeApiName}", false, true, false];
export const updateActionType: EndpointDescriptor = ["PUT", "/api/v2/ontologies/{ontologyRid}/actionTypes/{actionTypeApiName}", true, true, false];
export const deleteActionType: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/actionTypes/{actionTypeApiName}", false, true, false];

export const listLinkTypesForObjectType: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}/linkTypes", false, true, false];
export const createLinkType: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/linkTypes", true, true, false];
export const getLinkType: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/linkTypes/{linkTypeApiName}", false, true, false];
export const deleteLinkType: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/linkTypes/{linkTypeApiName}", false, true, false];

export const listInterfaceTypes: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/interfaceTypes", false, true, false];
export const createInterfaceType: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/interfaceTypes", true, true, false];
export const getInterfaceType: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/interfaceTypes/{interfaceTypeApiName}", false, true, false];
export const deleteInterfaceType: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/interfaceTypes/{interfaceTypeApiName}", false, true, false];

// ---------------------------------------------------------------------------
// Object Service
// ---------------------------------------------------------------------------

export const listObjects: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}", false, true, false];
export const getObject: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}", false, true, false];
export const createObject: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}", true, true, false];
export const updateObject: EndpointDescriptor = ["PUT", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}", true, true, false];
export const deleteObject: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}", false, true, false];

export const loadObjects: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/objectSets/loadObjects", true, true, false];
export const aggregate: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/objectSets/aggregate", true, true, false];

export const getLinks: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}/links/{linkType}", false, true, false];
export const createLink: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}/links/{linkType}", true, true, false];
export const deleteLink: EndpointDescriptor = ["DELETE", "/api/v2/ontologies/{ontologyRid}/objects/{objectType}/{primaryKey}/links/{linkType}/{targetPrimaryKey}", false, true, false];

// ---------------------------------------------------------------------------
// Action Service
// ---------------------------------------------------------------------------

export const applyAction: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/actions/{actionApiName}/apply", true, true, false];
export const validateAction: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/actions/{actionApiName}/validate", true, true, false];
export const applyBatchAction: EndpointDescriptor = ["POST", "/api/v2/ontologies/{ontologyRid}/actions/{actionApiName}/applyBatch", true, true, false];
export const listExecutions: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/actions/{actionApiName}/executions", false, true, false];
export const getExecution: EndpointDescriptor = ["GET", "/api/v2/ontologies/{ontologyRid}/actions/{actionApiName}/executions/{executionRid}", false, true, false];

// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------

export const token: EndpointDescriptor = ["POST", "/multipass/api/oauth2/token", true, false, false];
export const revoke: EndpointDescriptor = ["POST", "/multipass/api/oauth2/revoke", true, false, false];
export const authorize: EndpointDescriptor = ["GET", "/multipass/api/oauth2/authorize", false, false, false];
export const userinfo: EndpointDescriptor = ["GET", "/multipass/api/userinfo", false, true, false];
export const openIdConfiguration: EndpointDescriptor = ["GET", "/.well-known/openid-configuration", false, false, false];

// ---------------------------------------------------------------------------
// Dataset Service
// ---------------------------------------------------------------------------

export const listDatasets: EndpointDescriptor = ["GET", "/api/v2/datasets", false, true, false];
export const createDataset: EndpointDescriptor = ["POST", "/api/v2/datasets", true, true, false];
export const getDataset: EndpointDescriptor = ["GET", "/api/v2/datasets/{datasetRid}", false, true, false];
export const deleteDataset: EndpointDescriptor = ["DELETE", "/api/v2/datasets/{datasetRid}", false, true, false];

export const listBranches: EndpointDescriptor = ["GET", "/api/v2/datasets/{datasetRid}/branches", false, true, false];
export const createBranch: EndpointDescriptor = ["POST", "/api/v2/datasets/{datasetRid}/branches", true, true, false];
export const getBranch: EndpointDescriptor = ["GET", "/api/v2/datasets/{datasetRid}/branches/{branchName}", false, true, false];
export const deleteBranch: EndpointDescriptor = ["DELETE", "/api/v2/datasets/{datasetRid}/branches/{branchName}", false, true, false];

export const openTransaction: EndpointDescriptor = ["POST", "/api/v2/datasets/{datasetRid}/transactions", true, true, false];
export const commitTransaction: EndpointDescriptor = ["POST", "/api/v2/datasets/{datasetRid}/transactions/{transactionRid}/commit", false, true, false];
export const abortTransaction: EndpointDescriptor = ["POST", "/api/v2/datasets/{datasetRid}/transactions/{transactionRid}/abort", false, true, false];

export const listFiles: EndpointDescriptor = ["GET", "/api/v2/datasets/{datasetRid}/files", false, true, false];
export const uploadFile: EndpointDescriptor = ["PUT", "/api/v2/datasets/{datasetRid}/files/{filePath}", true, true, false];
export const downloadFile: EndpointDescriptor = ["GET", "/api/v2/datasets/{datasetRid}/files/{filePath}", false, true, false];
export const deleteFile: EndpointDescriptor = ["DELETE", "/api/v2/datasets/{datasetRid}/files/{filePath}", false, true, false];

// ---------------------------------------------------------------------------
// Admin Service
// ---------------------------------------------------------------------------

export const listUsers: EndpointDescriptor = ["GET", "/api/v2/admin/users", false, true, false];
export const searchUsers: EndpointDescriptor = ["GET", "/api/v2/admin/users/search", false, true, false];
export const createUser: EndpointDescriptor = ["POST", "/api/v2/admin/users", true, true, false];
export const getUser: EndpointDescriptor = ["GET", "/api/v2/admin/users/{userRid}", false, true, false];
export const updateUser: EndpointDescriptor = ["PUT", "/api/v2/admin/users/{userRid}", true, true, false];
export const deleteUser: EndpointDescriptor = ["DELETE", "/api/v2/admin/users/{userRid}", false, true, false];
export const getUserGroups: EndpointDescriptor = ["GET", "/api/v2/admin/users/{userRid}/groups", false, true, false];

export const listGroups: EndpointDescriptor = ["GET", "/api/v2/admin/groups", false, true, false];
export const createGroup: EndpointDescriptor = ["POST", "/api/v2/admin/groups", true, true, false];
export const getGroup: EndpointDescriptor = ["GET", "/api/v2/admin/groups/{groupRid}", false, true, false];
export const deleteGroup: EndpointDescriptor = ["DELETE", "/api/v2/admin/groups/{groupRid}", false, true, false];

export const listGroupMembers: EndpointDescriptor = ["GET", "/api/v2/admin/groups/{groupRid}/members", false, true, false];
export const addGroupMember: EndpointDescriptor = ["POST", "/api/v2/admin/groups/{groupRid}/members", true, true, false];
export const removeGroupMember: EndpointDescriptor = ["DELETE", "/api/v2/admin/groups/{groupRid}/members/{userRid}", false, true, false];

// ---------------------------------------------------------------------------
// Compass Service
// ---------------------------------------------------------------------------

export const listRootResources: EndpointDescriptor = ["GET", "/api/v2/resources", false, true, false];
export const createResource: EndpointDescriptor = ["POST", "/api/v2/resources", true, true, false];
export const searchResources: EndpointDescriptor = ["GET", "/api/v2/resources/search", false, true, false];
export const getResourceByPath: EndpointDescriptor = ["GET", "/api/v2/resources/byPath", false, true, false];
export const getResource: EndpointDescriptor = ["GET", "/api/v2/resources/{resourceRid}", false, true, false];
export const updateResource: EndpointDescriptor = ["PUT", "/api/v2/resources/{resourceRid}", true, true, false];
export const deleteResource: EndpointDescriptor = ["DELETE", "/api/v2/resources/{resourceRid}", false, true, false];
export const listChildren: EndpointDescriptor = ["GET", "/api/v2/resources/{resourceRid}/children", false, true, false];
