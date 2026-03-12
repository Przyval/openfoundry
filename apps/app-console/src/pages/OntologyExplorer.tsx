import { useCallback, useState } from "react";
import {
  Card,
  HTMLTable,
  NonIdealState,
  Spinner,
  Tab,
  Tabs,
  Tree,
  type TreeNodeInfo,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";

interface Ontology {
  apiName: string;
  displayName: string;
  description: string;
  rid: string;
}

interface OntologyListResponse {
  data: Ontology[];
}

interface ObjectType {
  apiName: string;
  displayName?: string;
  description?: string;
  primaryKey: string;
}

interface OntologyFullResponse {
  objectTypes?: ObjectType[];
  actionTypes?: Array<{ apiName: string; description?: string }>;
  linkTypes?: Array<{ apiName: string; description?: string }>;
  interfaceTypes?: Array<{ apiName: string; description?: string }>;
}

export default function OntologyExplorer() {
  const [selectedRid, setSelectedRid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("objectTypes");

  const { data: ontologyList, loading: listLoading } =
    useApi<OntologyListResponse>("/api/v2/ontologies");

  const { data: ontologyDetail, loading: detailLoading } =
    useApi<OntologyFullResponse>(
      selectedRid ? `/api/v2/ontologies/${selectedRid}/fullMetadata` : "",
    );

  const treeNodes: TreeNodeInfo[] = (ontologyList?.data ?? []).map((o) => ({
    id: o.rid,
    label: o.displayName || o.apiName,
    icon: "diagram-tree" as const,
    isSelected: o.rid === selectedRid,
  }));

  const handleNodeClick = useCallback((node: TreeNodeInfo) => {
    setSelectedRid(String(node.id));
  }, []);

  const objectTypes = ontologyDetail?.objectTypes ?? [];
  const actionTypes = ontologyDetail?.actionTypes ?? [];
  const linkTypes = ontologyDetail?.linkTypes ?? [];
  const interfaceTypes = ontologyDetail?.interfaceTypes ?? [];

  return (
    <>
      <PageHeader title="Ontology Explorer" />
      <div className="two-panel">
        {/* Left: ontology list */}
        <Card className="two-panel__left">
          {listLoading ? (
            <Spinner size={30} />
          ) : treeNodes.length === 0 ? (
            <NonIdealState icon="search" title="No ontologies found" />
          ) : (
            <Tree contents={treeNodes} onNodeClick={handleNodeClick} />
          )}
        </Card>

        {/* Right: ontology details */}
        <div className="two-panel__right">
          {!selectedRid ? (
            <NonIdealState
              icon="select"
              title="Select an ontology"
              description="Choose an ontology from the left panel to view its details."
            />
          ) : detailLoading ? (
            <Spinner size={40} />
          ) : (
            <Tabs
              id="ontology-tabs"
              selectedTabId={activeTab}
              onChange={(tabId) => setActiveTab(String(tabId))}
            >
              <Tab
                id="objectTypes"
                title="Object Types"
                panel={
                  <HTMLTable bordered compact striped style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>API Name</th>
                        <th>Display Name</th>
                        <th>Primary Key</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objectTypes.map((ot) => (
                        <tr key={ot.apiName}>
                          <td>{ot.apiName}</td>
                          <td>{ot.displayName ?? "-"}</td>
                          <td>{ot.primaryKey}</td>
                          <td>{ot.description ?? "-"}</td>
                        </tr>
                      ))}
                      {objectTypes.length === 0 && (
                        <tr>
                          <td colSpan={4}>No object types</td>
                        </tr>
                      )}
                    </tbody>
                  </HTMLTable>
                }
              />
              <Tab
                id="actionTypes"
                title="Action Types"
                panel={
                  <HTMLTable bordered compact striped style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>API Name</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionTypes.map((at) => (
                        <tr key={at.apiName}>
                          <td>{at.apiName}</td>
                          <td>{at.description ?? "-"}</td>
                        </tr>
                      ))}
                      {actionTypes.length === 0 && (
                        <tr>
                          <td colSpan={2}>No action types</td>
                        </tr>
                      )}
                    </tbody>
                  </HTMLTable>
                }
              />
              <Tab
                id="linkTypes"
                title="Link Types"
                panel={
                  <HTMLTable bordered compact striped style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>API Name</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkTypes.map((lt) => (
                        <tr key={lt.apiName}>
                          <td>{lt.apiName}</td>
                          <td>{lt.description ?? "-"}</td>
                        </tr>
                      ))}
                      {linkTypes.length === 0 && (
                        <tr>
                          <td colSpan={2}>No link types</td>
                        </tr>
                      )}
                    </tbody>
                  </HTMLTable>
                }
              />
              <Tab
                id="interfaces"
                title="Interfaces"
                panel={
                  <HTMLTable bordered compact striped style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>API Name</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaceTypes.map((it) => (
                        <tr key={it.apiName}>
                          <td>{it.apiName}</td>
                          <td>{it.description ?? "-"}</td>
                        </tr>
                      ))}
                      {interfaceTypes.length === 0 && (
                        <tr>
                          <td colSpan={2}>No interfaces</td>
                        </tr>
                      )}
                    </tbody>
                  </HTMLTable>
                }
              />
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
