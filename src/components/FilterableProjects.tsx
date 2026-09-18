import { Fragment, useMemo, useState } from "react";
import type { Project } from "../lib/projects";
import type { Domain } from "../data/domains";

interface Props {
	projects: Project[];
	domains: Domain[];
	categories: string[];
}

export default function FilterableProjects({ projects, domains, categories }: Props) {
	// one selection per row: picking a chip replaces the previous one, clicking the
	// active chip clears the row. No multi-select by design.
	const [domain, setDomain] = useState<string | null>(null);
	const [category, setCategory] = useState<string | null>(null);
	const [q, setQ] = useState("");

	const pick = (current: string | null, value: string, setter: (v: string | null) => void) =>
		setter(current === value ? null : value);

	const filtered = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return projects.filter((p) => {
			if (domain && p.domain !== domain) return false;
			if (category && p.category !== category) return false;
			if (needle) {
				const hay = (p.name + " " + p.summary + " " + p.tags.join(" ") + " " + (p.course ?? "") + " " + (p.org ?? "")).toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			return true;
		});
	}, [projects, domain, category, q]);

	const grouped = useMemo(
		() =>
			domains
				.map((d) => ({ domain: d, items: filtered.filter((p) => p.domain === d.slug) }))
				.filter((g) => g.items.length > 0),
		[filtered, domains],
	);

	const anyFilter = Boolean(domain || category || q.trim());
	const clearAll = () => {
		setDomain(null);
		setCategory(null);
		setQ("");
	};

	return (
		<div>
			<div className="filter-bar">
				<input
					className="filter-search"
					type="search"
					placeholder="Search projects…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					aria-label="Search projects"
				/>
				<div className="chip-row" role="radiogroup" aria-label="Domain">
					{domains.map((d) => {
						const on = domain === d.slug;
						return (
							<button
								key={d.slug}
								className={"chip" + (on ? " on" : "")}
								role="radio"
								aria-checked={on}
								aria-pressed={on}
								title={on ? `Clear the ${d.label} filter` : `Show only ${d.label}`}
								style={on ? { background: d.color, borderColor: d.color, color: "#fff" } : { borderColor: d.color, color: d.color }}
								onClick={() => pick(domain, d.slug, setDomain)}
							>
								{d.label}
							</button>
						);
					})}
				</div>
				<div className="chip-row" role="radiogroup" aria-label="Category">
					{categories.map((c) => {
						const on = category === c;
						return (
							<button
								key={c}
								className={"chip cat" + (on ? " on" : "")}
								role="radio"
								aria-checked={on}
								aria-pressed={on}
								title={on ? `Clear the ${c} filter` : `Show only ${c} projects`}
								onClick={() => pick(category, c, setCategory)}
							>
								{c}
							</button>
						);
					})}
					{anyFilter ? (
						<button className="chip clear" onClick={clearAll}>
							Clear ✕
						</button>
					) : null}
				</div>
				<div className="result-count">
					{filtered.length} project{filtered.length === 1 ? "" : "s"}
					<span className="filter-hint">One filter per row — click the active chip to clear it.</span>
				</div>
			</div>

			{grouped.length === 0 ? (
				<p className="empty">No projects match those filters.</p>
			) : (
				grouped.map((g) => (
					<section key={g.domain.slug} className="domain-section">
						<div className="domain-head" style={{ borderColor: g.domain.color }}>
							<h2 style={{ color: g.domain.color }}>{g.domain.label}</h2>
							<p>{g.domain.blurb}</p>
						</div>
						<div className="project-grid">
							{g.items.map((p) => (
								<Card key={p.slug} p={p} color={g.domain.color} />
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}

function Card({ p, color }: { p: Project; color: string }) {
	const asset = p.hasVisuals ? p.assets.find((a) => a.type === "image" || a.thumb) : null;
	const coverSrc = p.cover || (asset ? (asset.type === "image" ? asset.src : asset.thumb) : null);
	const meta = [p.date.slice(0, 4), p.category, p.effort].filter(Boolean);

	return (
		<a href={`/projects/${p.slug}`} className={"project-card" + (coverSrc ? "" : " text-card")}>
			{coverSrc ? (
				<div className="card-media">
					<img src={coverSrc} alt={p.name} loading="lazy" />
				</div>
			) : (
				<div className="card-accent" style={{ background: color }} />
			)}
			<div className="card-body">
				<div className="card-meta">
					{meta.map((part, i) => (
						<Fragment key={`${i}-${part}`}>
							{i > 0 ? <span>·</span> : null}
							<span>{part}</span>
						</Fragment>
					))}
					{p.status ? <span className="status-pill">{p.status}</span> : null}
				</div>
				<h3>{p.name}</h3>
				{p.summary ? <p className="card-summary">{p.summary}</p> : null}
				{p.tags.length ? (
					<div className="card-tags">
						{p.tags.slice(0, 4).map((t) => (
							<span key={t} className="tag">{t}</span>
						))}
					</div>
				) : null}
			</div>
		</a>
	);
}
