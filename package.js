Package.describe({
	documentation: 'README.md',
	git: 'https://github.com/timdown/rangy.git',
	name: 'timdown:rangy',
	summary: 'A cross-browser JavaScript range and selection library.',
	version: '1.3.1-dev'
});

Package.onUse(function(api) {
	api.versionsFrom('1.0');

	api.addFiles('lib/rangy-core.js', 'client');

	api.export('rangy', 'client');
});
