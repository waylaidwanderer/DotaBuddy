const remote = require('electron').remote;

// bind titlebar stuff
$('.minimize').click(function() {
    remote.getCurrentWindow().minimize();
});
$('.maximize').click(function() {
    let window = remote.getCurrentWindow();
    if (window.isMaximized()) {
        window.unmaximize();
        $(this).find('i').text('expand_less');
    } else {
        window.maximize();
        $(this).find('i').text('expand_more');
    }
});
$('.close').click(function() {
    remote.getCurrentWindow().close();
});
$(window).resize(function() {
    if (remote.getCurrentWindow().isMaximized()) {
        $('.maximize').find('i').text('expand_more');
    } else {
        $('.maximize').find('i').text('expand_less');
    }
});

$(document).ready(function() {
    $('main').perfectScrollbar();
});

$(document).on('click', 'a[target="_blank"]', function(e) {
    e.preventDefault();
    remote.shell.openExternal(this.href);
});

$(document).on('click.collapse', '.collapsible-header', function(e) {
    if ($(e.target).get(0).tagName == "A" && $(e.target).attr('target') == "_blank") {
        $(this).trigger('click.collapse');
    }
});

$('.collapsible .header').click(function() {
    if ($(this).data('state') == 'open') {
        $(this).parent().find('.active').trigger('click.collapse');
        $(this).data('state', 'closed');
    } else {
        $(this).parent().find('.collapsible-header:not(.active)').trigger('click');
        $(this).data('state', 'open');
    }
});

document.addEventListener("keydown", function (e) {
    if (e.which === 123) {
        remote.getCurrentWindow().toggleDevTools();
    } else if (e.which === 116) {
        location.reload();
    }
});

$('.players').mouseenter(function() {
    $(this).find('.kda').hide();
    $(this).find('.gpm-xpm').fadeIn('fast');
}).mouseleave(function() {
    $(this).find('.gpm-xpm').hide();
    $(this).find('.kda').fadeIn('fast');
});
