import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import Tasks from "./Tasks";
import Clusters from "./Clusters";
import Credentials from "./Credentials";
import Knowledge from "./Knowledge";

const TABS = ["Tasks", "Clusters", "Credentials", "Knowledge"];

export default function ProjectDetail() {
  const { id } = useParams();
  const { isManager } = useAuth();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("Tasks");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then((r) => setProject(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  if (!project)
    return (
      <div className="page-body">
        <p>Project not found.</p>
      </div>
    );

  return (
    <>
      <div className="page-header" style={{ paddingBottom: "16px" }}>
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-3)",
              marginBottom: "4px",
            }}
          >
            {project.client_name || "No client"}
          </div>
          <div className="page-title">{project.name}</div>
          {project.description && (
            <div
              className="page-subtitle"
              style={{ marginTop: "4px", maxWidth: "600px" }}
            >
              {project.description}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`badge badge-${project.status}`}>
            {project.status?.replace("_", " ")}
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            {project.members?.map((m) => (
              <div
                key={m.id}
                className="user-avatar"
                title={m.name}
                style={{
                  width: "28px",
                  height: "28px",
                  fontSize: "11px",
                  overflow: "hidden",
                  padding: 0,
                }}
              >
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    alt={m.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                      display: "block",
                    }}
                  />
                ) : (
                  m.name[0]
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="project-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "Tasks" && <Tasks project={project} />}
        {tab === "Clusters" && <Clusters project={project} />}
        {tab === "Credentials" && <Credentials project={project} />}
        {tab === "Knowledge" && <Knowledge project={project} />}
      </div>
    </>
  );
}
