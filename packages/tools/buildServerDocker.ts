import { rootDir } from './tool-utils';
import * as moment from 'moment';
import { execCommand } from '@joplin/utils';

interface Argv {
	dryRun?: boolean;
	pushImages?: boolean;
	repository?: string;
	tagName?: string;
}

export function getVersionFromTag(tagName: string, isPreRelease: boolean): string {
	const s = tagName.split('-');
	const mainVersion = s[1].replace(/^(v)/, '');
	const metaComponents = s.slice(2).filter(item => item !== 'beta');

	// Append `git describe` components for pre release images. Mostly for case without `tagName` arg
	const suffix = isPreRelease ? `-beta${metaComponents.length > 0 ? `.${metaComponents.join('.')}` : ''}` : '';
	return mainVersion + suffix;
}

export function getIsPreRelease(_tagName: string): boolean {
	// For now we only create pre-releases from CI. It's after, once the release
	// has been proven stable, that it is tagged as "latest".
	return true;
	// return tagName.indexOf('-beta') > 0;
}

async function main() {
	const argv = require('yargs').argv as Argv;
	if (!argv.tagName) console.info('No `--tag-name` was specified. A latest git tag will be used instead.');
	if (!argv.repository) throw new Error('--repository not provided');

	const dryRun = !!argv.dryRun;
	const pushImages = !!argv.pushImages;
	const repository = argv.repository;
	const tagName = argv.tagName || `server-${await execCommand('git describe --tags --match v*', { showStdout: false })}`;
	const source = 'https://github.com/laurent22/joplin.git';

	const isPreRelease = getIsPreRelease(tagName);
	const imageVersion = getVersionFromTag(tagName, isPreRelease);
	const buildDate = moment(new Date().getTime()).format('YYYY-MM-DDTHH:mm:ssZ');
	let revision = '';
	try {
		revision = await execCommand('git rev-parse --short HEAD', { showStdout: false });
	} catch (error) {
		console.info('Could not get git commit: metadata revision field will be empty');
	}
	const buildArgs = `--build-arg BUILD_DATE="${buildDate}" --build-arg REVISION="${revision}" --build-arg VERSION="${imageVersion}" --build-arg SOURCE="${source}"`;
	const dockerTags: string[] = [];
	const versionPart = imageVersion.split('.');
	const patchVersionPart = versionPart[2].split('-')[0];
	dockerTags.push(isPreRelease ? 'beta' : 'latest');
	dockerTags.push(versionPart[0] + (isPreRelease ? '-beta' : ''));
	dockerTags.push(`${versionPart[0]}.${versionPart[1]}${isPreRelease ? '-beta' : ''}`);
	dockerTags.push(`${versionPart[0]}.${versionPart[1]}.${patchVersionPart}${isPreRelease ? '-beta' : ''}`);
	if (dockerTags.indexOf(imageVersion) < 0) {
		dockerTags.push(imageVersion);
	}


	process.chdir(rootDir);
	console.info(`Running from: ${process.cwd()}`);

	console.info('tagName:', tagName);
	console.info('pushImages:', pushImages);
	console.info('imageVersion:', imageVersion);
	console.info('isPreRelease:', isPreRelease);
	console.info('Docker tags:', dockerTags.join(', '));

	const dockerCommand = `docker build --progress=plain -t "${repository}:${imageVersion}" ${buildArgs} -f Dockerfile.server .`;
	if (dryRun) {
		console.info(dockerCommand);
		return;
	}

	await execCommand(dockerCommand);

	for (const tag of dockerTags) {
		await execCommand(`docker tag "${repository}:${imageVersion}" "${repository}:${tag}"`);
		if (pushImages) await execCommand(`docker push ${repository}:${tag}`);
	}
}

if (require.main === module) {
	// eslint-disable-next-line promise/prefer-await-to-then
	main().catch((error) => {
		console.error('Fatal error');
		console.error(error);
		process.exit(1);
	});
}
