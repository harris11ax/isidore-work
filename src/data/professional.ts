// The homepage's "Professional Work" list: every project record whose category is
// `Work`, anchored to the CV role it came out of.
//
// The anchor now lives in the content database (the project form's "CV role"
// field) and is generated into `./project-roles`; the employer / role title /
// dates shown on the homepage come from `roles.ts`, the CV spine.
//
// If a Work project gains no anchor it is reported (never silently dropped) and
// rendered without the role line, so a missing anchor shows up as a build warning.
import { projects, type Project } from '../lib/projects';
import { ROLES, type Role } from './roles';
import { ROLE_BY_SLUG } from './project-roles';

export interface ProfessionalEntry {
	project: Project;
	role?: Role;
}

const work = projects.filter((p) => p.category === 'Work');

const unanchored = work.filter((p) => !ROLE_BY_SLUG[p.slug]).map((p) => p.slug);
if (unanchored.length) {
	console.warn(
		`[professional] Work project(s) with no role anchor in ROLE_BY_SLUG — ` +
			`add them so the homepage shows employer and dates: ${unanchored.join(', ')}`,
	);
}

/** Work-category records, newest first (projects.json is already date-sorted). */
export const professionalEntries: ProfessionalEntry[] = work.map((project) => ({
	project,
	role: ROLES.find((r) => r.id === ROLE_BY_SLUG[project.slug]),
}));

/** Everything that is not professional work — linked, not listed, on the homepage. */
export const otherProjectCount = projects.length - work.length;
