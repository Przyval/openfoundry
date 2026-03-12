import { NavLink } from "react-router-dom";

interface NavSection {
  title: string;
  links: { to: string; label: string }[];
}

const sections: NavSection[] = [
  {
    title: "Introduction",
    links: [
      { to: "/getting-started", label: "Getting Started" },
      { to: "/architecture", label: "Architecture" },
    ],
  },
  {
    title: "Guides",
    links: [
      { to: "/ontology-guide", label: "Ontology Guide" },
      { to: "/sdk-guide", label: "SDK Guide" },
      { to: "/deployment", label: "Deployment" },
    ],
  },
  {
    title: "Reference",
    links: [
      { to: "/api-reference", label: "API Reference" },
    ],
  },
];

export function DocNav() {
  return (
    <nav className="doc-nav">
      {sections.map((section) => (
        <div key={section.title} className="doc-nav-section">
          <h3 className="doc-nav-heading">{section.title}</h3>
          <ul className="doc-nav-list">
            {section.links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `doc-nav-link${isActive ? " doc-nav-link--active" : ""}`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
