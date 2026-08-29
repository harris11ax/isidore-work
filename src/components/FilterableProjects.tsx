import { useMemo, useState } from "react";
import type { Project } from "../lib/projects";
import type { Domain } from "../data/domains";

interface Props {
	projects: Project[];
	domains: Domain[];
	categories: string[];
}

const domainColor = (domains: Domain[], slug: string) =>
	domains.find((d) => d.slug === slug)?.color ?? "#666";
const domainLabel = (domains: Domain[], slug: string) =>
	domains.find((d) => d.slug === slug)?.label ?? slug;

export default function FilterableProjects({ projects, domains, categories }: Props) {
	const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
	const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
	const [q, setQ] = useState("");

	const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
		const next = new Set(set);
		next.has(val) ? next.delete(val) : next.add(val);
		setter(next);
	};

	const filtered = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return projects.filter((p) => {
			if (activeDomains.size && !activeDomains.has(p.domain)) return false;
			if (activeCats.size && !activeCats.has(p.category)) return false;
			if (needle) {
				const hay = (p.name + " " + p.summary + " " + p.tags.join(" ")).toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			return true;
		});
	}, [projects, activeDomains, activeCats, q]);

	const grouped = useMemo(() => {
		return domains
			.map((d) => ({ domain: d, items: filtered.filter((p) => p.domain === d.slug) }))
			.filter((g) => g.items.length > 0);
	}, [filtered, domains]);

	const anyFilter = activeDomains.size || activeCats.size || q.trim();

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
				<div className="chip-row">
					{domains.map((d) => (
						<button
							key={d.slug}
							className={"chip" + (activeDomains.has(d.slug) ? " on" : "")}
							style={activeDomains.has(d.slug) ? { background: d.color, borderColor: d.color, color: "#fff" } : { borderColor: d.color, color: d.color }}
							onClick={() => toggle(activeDomains, d.slug, setActiveDomains)}
						>
							{d.label}
						</button>
					))}
				</div>
				<div className="chip-row">
					{categories.map((c) => (
						<button
							key={c}
							className={"chip cat" + (activeCats.has(c) ? " on" : "")}
							onClick={() => toggle(activeCats, c, setActiveCats)}
						>
							{c}
						</button>
					))}
					{anyFilter ? (
						<button
							className="chip clear"
							onClick={() => { setActiveDomains(new Set()); setActiveCats(new Set()); setQ(""); }}
						>
							Clear ✕
						</button>
					) : null}
				</div>
				<div className="result-count">{filtered.length} project{filtered.length === 1 ? "" : "s"}</div>
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
					<span>{p.date.slice(0, 4)}</span>
					<span>·</span>
					<span>{p.category}</span>
					<span>·</span>
					<span>{p.effort}</span>
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
