// Using jQuery
$(() => {
	var path = window.location.pathname;
	var navlink = $('a[href="' + path + '"]');

	if (navlink) {
		navlink.append('<span class="sr-only">(current)</span>');
		navlink.parent('li').addClass("active");
	}
});