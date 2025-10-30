(function($) {
    "use strict";

    $(document).ready( function() {

       

        //>> Project Hover Js Start <<//
        const getSlide = $('.main-box, .box').length - 1;
        const slideCal = 100 / getSlide + '%';
        
        $('.box').css({
            "width": slideCal
        });
        
        $(document).on('mouseenter', '.box', function() {
            $('.box').removeClass('active');
            $(this).addClass('active');
        });     

   
       

    }); // End Document Ready Function

   

})(jQuery); // End jQuery