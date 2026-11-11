window.onload = function(){

var app = document.getElementById('app');
var menu = document.getElementById('menu');
var lis = menu.getElementsByTagName('li');
var dls = menu.getElementsByTagName('dl');

var imain = document.getElementById('imain');
var ifm = imain.getElementsByTagName('iframe')[0];


arr =[ [
    {url:'html/alshow/index.html',text:'基于bootstrap实现，根据缩放可改变排版和样式'},
    {url:'html/hm/index.html',text:'响应式布局，可根据缩放按比例改变大小，动画用swiper实现，css采用less'},
    {url:'html/studyhtml/index.html',text:'html页面'},
    {url:'html/xh/index.html',text:'小程序页面布局'},
    {url:'html/jd/index.html',text:'练习做的小案例，图标使用icomoon'}
],[
    {url:'js/contentFind/index.html',text:'js1'},
    {url:'js/contentMove/index.html',text:'js2'},
    {url:'js/createDiv/index.html',text:'js3'},
    {url:'js/draw/index.html',text:'js4'},
    {url:'js/jpgChange/index.html',text:'js5'},
    {url:'js/jpgChangeIndex/index.html',text:'js6'},
    {url:'js/startMove/index.html',text:'js7'},
    {url:'js/swiper/index.html',text:'js8'}
],[
    {url:'jquery/animation/index.html',text:'jquery1'},
    {url:'jquery/event/index.html',text:'jqueryj2'},
    {url:'jquery/nav/index.html',text:'jqueryj3'},
    {url:'jquery/shopCart/index.html',text:'jqueryj4'},
]]

for (var i = 0; i < lis.length; i++) {

    lis[i].index = i;

    lis[i].onclick = function () {
		//alert(window.innerHeight)
		app.style.height = (window.innerHeight - 100)*0.0625 + 'rem';
        for (var i = 0; i < lis.length; i++) {
            lis[i].className = '';
            dls[i].style.display = 'none';
        }

        this.className = 'active';
        dls[this.index].style.display = 'block';
        var x=this.index;

        var dds = dls[this.index].getElementsByTagName('dd');

        for (var i = 0; i < dds.length; i++) {
            dds[i].index = i;
            dds[i].onclick = function () {
                //alert(arr[x][this.index]);
                ifm.src=arr[x][this.index].url;
				
	document.getElementById('tail').innerHTML= arr[x][this.index].text;
            }
        }

    }

}


lis[0].onclick();
  
  
}