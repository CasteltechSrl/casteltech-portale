(function($) {
	
	$(document).ready(function(){
		if(!mtfcf7_settings.active_form) {
			console.log('not set contact form 7 id');
			return;
		}

		// if($('.wpcf7').length >= 1) {
		// 	if($('.wpcf7').attr('id').indexOf('wpcf7-f'+mtfcf7_settings.active_form)==-1){
		// 		console.log('this is not active contact form 7 form', mtfcf7_settings.active_form, $('.wpcf7').attr('id'));
		// 		return;
		// 	}
		// }

		$('.wpcf7 tip').each(function(index) {
		  	$that = $(this);

		  	$wpcf7 = $that.closest('.wpcf7');
		  	if($wpcf7.length === 0) return;
		  	if($wpcf7.attr('id').indexOf('wpcf7-f'+mtfcf7_settings.active_form)==-1){
					console.log('this is not active contact form 7 form', mtfcf7_settings.active_form, $('.wpcf7').attr('id'));
					return;
				}

		  	console.log('mtfcf7_settings', mtfcf7_settings);
			$desc = $that.html();
			var extraHTML = '';
			if(mtfcf7_settings && mtfcf7_settings.add_icon) {
		  		extraHTML = ' <i class="fa fa-question-circle"></i>';
		  	}
		  	
			$parentHTML = $that.parent().html().replace('<tip>',extraHTML+'</label-magic>'+'<tip>');
			
			$parent = $that.parent();
			$parent.html('<label-magic>'+$parentHTML);
			console.log('desc', $desc);
			if($desc.length > 0){
				$that2 = $parent.find('label-magic');
				console.log('label-magic', $that2);
			  	if(mtfcf7_settings && (mtfcf7_settings.mouse_over ||  mtfcf7_settings.hover_input ||  mtfcf7_settings.focus_input)) {
			  		$that2.parent().addClass('mm-tooltip-cf7-li');
			  	}
			  	
	
			  	if(mtfcf7_settings && mtfcf7_settings.mouse_over) {
				  	$that2.addClass('mm-tooltip-cf7');
				}
			  	if(mtfcf7_settings && mtfcf7_settings.add_underline) {
			  		$that2.addClass('mm-tooltip-cf7-title-underline');
			  	}
			}
		});
		
		eval('var tooltip_code = ' + mtfcf7.js_code);
		if(mtfcf7_settings && mtfcf7_settings.mouse_over) {
			$('.mm-tooltip-cf7').each(function() { // Notice the .each() loop, discussed below
				//console.log('.mm-tooltip-cf7', $(this));
				
	      	$(this).qtip($.extend(tooltip_code, {
	          	content: {
	            	text: $(this).parents('.mm-tooltip-cf7-li').find('tip').text() // Use the "div" element next to this for the content
	          	},
	          	show: 'hover',
	          	hide: {
                    fixed: true,
                    delay: 300
                }
	      	}));
		  });
		}

		if(mtfcf7_settings && mtfcf7_settings.focus_input) {
			$('.mm-tooltip-cf7-li input, .mm-tooltip-cf7-li textarea').each(function() { // Notice the .each() loop, discussed below
		      	$(this).qtip($.extend(tooltip_code, {
		          	content: {
		            	text: $(this).parents('.mm-tooltip-cf7-li').find('tip').text() // Use the "div" element next to this for the content
		          	},
		          	show: 'focus',
		          	hide: 'unfocus'
		      	}));
		      	$(this).on('focus', function(){
		      		$(this).closest('.mm-tooltip-cf7-li').addClass('mm-tooltip-cf7-li-focus');
		      	}).on('blur', function(){
		      		$(this).closest('.mm-tooltip-cf7-li').removeClass('mm-tooltip-cf7-li-focus');
		      	});
		    });
		}

	    var $container = $('<style id="mtfcf7-tooltip-css" type="text/css"></style>').appendTo("body");
	    $container.text(mtfcf7.css_code+mtfcf7_settings.custom_css);
	});

})(jQuery);
