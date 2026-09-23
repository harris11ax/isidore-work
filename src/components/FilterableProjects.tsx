import { Fragment, useMemo, useRef, useState } from "react";
import type { Project } from "../lib/projects";
import type { Domain } from "../data/domains";

interface Props {
	projects: Project[];
	domains: Domain[];
	categories: string[];
}

/** #abc / #aabbcc -> rgba(..., alpha) for the text-card band. */
function tint(hex: string, alpha: number): string {
	const h = String(hex || "").replace("#", "");
	const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	if (full.length !== 6) return "rgba(0, 0, 0, 0.04)";
	const n = parseInt(full, 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const NAV_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];

export default function FilterableProjects({ projects, domains, categories }: Props) {
	// one selection per row: picking a chip replaces the previous one, clicking the
	// active chip clears the row. No multi-select by design.
	const [domain, setDomain] = useState<string | null>(null);
	const [category, setCategory] = useState<string | null>(null);
	const [q, setQ] = useState("");
	const domainRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const categoryRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const pick = (current: string | null, value: string, setter: (v: string | null) => void) =>
		setter(current === value ? null : value);

	/**
	 * WAI-ARIA radiogroup keyboard support: the arrow keys move to the next option
	 * *and* select it, Home/End jump to the ends. Without this, `role="radio"`
	 * promises keyboard navigation that plain buttons do not provide.
	 */
	const onRadioKeys = (
		event: React.KeyboardEvent<HTMLDivElement>,
		options: string[],
		current: string | null,
		setter: (v: string | null) => void,
		refs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
	) => {
		if (!NAV_KEYS.includes(event.key)) return;
		event.preventDefault();
		const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
		const at = options.indexOf(current ?? "");
		let next: string;
		if (event.key === "Home") next = options[0];
		else if (event.key === "End") next = options[options.length - 1];
		else if (at < 0) next = options[0];
		else next = options[(at + (forward ? 1 : -1) + options.length) % options.length];
		setter(next);
		refs.current[options.indexOf(next)]?.focus();
	};

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

	const domainSlugs = domains.map((d) => d.slug);

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
				<div
					className="chip-row"
					role="radiogroup"
					aria-label="Filter by domain"
					onKeyDown={(e) => onRadioKeys(e, domainSlugs, domain, setDomain, domainRefs)}
				>
					{domains.map((d, i) => {
						const on = domain === d.slug;
						return (
							<button
								key={d.slug}
								ref={(el) => {
									domainRefs.current[i] = el;
								}}
								type="button"
								className={"chip" + (on ? " on" : "")}
								role="radio"
								aria-checked={on}
								tabIndex={on || (domain === null && i === 0) ? 0 : -1}
								title={on ? `Clear the ${d.label} filter` : `Show only ${d.label}`}
								style={on ? { background: d.color, borderColor: d.color, color: "#fff" } : { borderColor: d.color, color: d.color }}
								onClick={() => pick(domain, d.slug, setDomain)}
							>
								{d.label}
							</button>
						);
					})}
				</div>
				<div
					className="chip-row"
					role="radiogroup"
					aria-label="Filter by category"
					onKeyDown={(e) => onRadioKeys(e, categories, category, setCategory, categoryRefs)}
				>
					{categories.map((c, i) => {
						const on = category === c;
						return (
							<button
								key={c}
								ref={(el) => {
									categoryRefs.current[i] = el;
								}}
								type="button"
								className={"chip cat" + (on ? " on" : "")}
								role="radio"
								aria-checked={on}
								tabIndex={on || (category === null && i === 0) ? 0 : -1}
								title={on ? `Clear the ${c} filter` : `Show only ${c} projects`}
								onClick={() => pick(category, c, setCategory)}
							>
								{c}
							</button>
						);
					})}
					{anyFilter ? (
						<button type="button" className="chip clear" onClick={clearAll}>
							Clear ✕
						</button>
					) : null}
				</div>
				<div className="result-count" role="status" aria-live="polite">
					{filtered.length} project{filtered.length === 1 ? "" : "s"}
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
								<Card key={p.slug} p={p} color={p.accentColor || g.domain.color} label={g.domain.label} />
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}

function Card({ p, color, label }: { p: Project; color: string; label: string }) {
	const asset = p.hasVisuals ? p.assets.find((a) => a.type === "image" || a.thumb) : null;
	const coverSrc = p.cover || (asset ? (asset.type === "image" ? asset.src : asset.thumb) : null);
	const meta = [p.date.slice(0, 4), p.category, p.effort].filter(Boolean);

	return (
		<a href={`/projects/${p.slug}`} className={"project-card" + (coverSrc ? "" : " text-card")}>
			{coverSrc ? (
				<div className="card-media">
					{/* decorative: the card's own <h3> already names the project */}
					<img src={coverSrc} alt="" loading="lazy" />
				</div>
			) : (
				<div className="card-media card-media--text" style={{ background: tint(color, 0.07), color }}>
					<span>{label}</span>
				</div>
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
