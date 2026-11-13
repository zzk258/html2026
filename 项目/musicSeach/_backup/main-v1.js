window.onload=function(){

//http://autumnfish.cn/search?keywords=


var div1=new Vue({
    el:'#app',
    data:{
        mdata:'c',
        mlist:[],
        murl:'',
        mpic:'v2.jpg',
        comment:[],
        showImg:false,
    },
    
    methods:{
        sh:function(){
            var that=this;
            axios.get('https://autumnfish.cn/search?keywords='+this.mdata)
            .then(function(response){
                that.mlist=response.data.result.songs;
                //console.log(response.data.result.songs[1])
                
            },function(err){
                alert(err)
            });
            
        },

        mplay:function(mid){
            var that=this;
            this.showImg=true;
            //获取地址
            axios.get('https://autumnfish.cn/song/url?id='+mid).then(function(response){
                that.murl=response.data.data[0].url;
                //console.log(response.data.data[0])
            },function(err){
                alert(err);
            });
            //播放图片
            axios.get('https://autumnfish.cn/song/detail?ids='+mid).then(function(response){
                that.mpic=response.data.songs[0].al.picUrl;
               //console.log(response.data.songs[0]);
            },function(err){
                alert(err);
            })

            axios.get('https://autumnfish.cn/comment/hot?type=0&id='+mid).then(function(response){
                //console.log(response.data.hotComments);
                that.comment=response.data.hotComments;
            },function(err){
                alert(err);
            })
        }
    },

    created(){
        this.sh();
    }
});

}
