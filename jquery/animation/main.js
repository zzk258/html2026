window.onload=function(){








//¶¯»­
//slideDown()  slideUp()   slideToggle()
//fadeIn()  fadeOut()  fadeToggle()
//show()   hide()  toggle()
//animate({},t,fn)




$("input").eq(1).click(function(){

$(".div1 div").fadeTo(1000,0.3);

});


$("input").eq(0).click(function(){

$(".div1 div").fadeOut(1000);

});


$("input").eq(2).click(function(){

$(".div1 div").fadeToggle(1000);

});

$(".div1 div").click(function(){
    $(this).animate({
    width:300,
    height:300,
    opacity:0.4,
    })
});



$("#div2 li").hover(function(){
    // $(this).siblings().fadeTo(10,0.5);
    $(this).fadeTo(1000,1).siblings().fadeTo(10,0.5);
   
});

    

    $("#div3 li").hover(function(){
        //alert($(this).index())
        $(this).stop().animate({
            width:100,
        }).siblings().stop().animate({
            width:60,
        })
       
    })

     

     



  
}