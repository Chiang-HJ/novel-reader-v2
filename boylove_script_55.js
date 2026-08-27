<script type="text/javascript">
    // 甇文?銝＊蝷箇倌?唳?蝷?    $(function () {
        if ( 1 == 2 ) {
            if ( $.cookie('changfontSize') == 'Y' ) {
                $('.reader-cartoon-chapter').css('fontSize', $.cookie('fontSize'));
            }

            if ( $.cookie('changbackground') == 'Y' ) {
                $('.reader-cartoon-chapter').css('background', $.cookie('background'));
                $('.reader-cartoon-chapter div').css('color', '#000000');
            }
        }
    });

    function changeFontSize(change) {
        $.cookie('changfontSize', 'Y');
        $.cookie('fontSize', change);
        $('.reader-cartoon-chapter').css('fontSize', change);
    }

    function changeBackground(change) {
        $.cookie('changbackground', 'Y');
        $.cookie('background', change);
        $('.reader-cartoon-chapter').css('background', change);
        $('.reader-cartoon-chapter div').css('color', '#000000');
    }

    function changeCapterLanguage(change) {
        $.cookie('langCapter', change);
        var langCookie = $.cookie('langCapter');
        var inputData = $('.reader-cartoon-chapter div').html();
        CapterDataTSTrans(inputData,langCookie);
    }

    if ( 1 == 2 ) {
        $(document).ready(function(){
            var langCookie = $.cookie('langCapter');
            var inputData = $('.reader-cartoon-chapter div').html();
            // CapterDataTSTrans(inputData,langCookie);
        })
    }

    function CapterDataTSTrans(inputData,langCookie){
        $.ajax({
            url: '/home/api/getCapterTSData',
            type: 'POST',
            data: {
                'inputData': inputData,
                'langCookie': langCookie,
            },
            success:function (data1) {
                $('.reader-cartoon-chapter div').html(data1);
            },error:function(){
                alert('?航炊');
            }
        })
    }

    var __UID = '';
    window.page = 1;
    window.order = 1;
    window.totalPage = 1;
    window.currPageNo = 1;
    var comment_loadmod = 'hot' ;
    window.bastCate = '1';
    const manhua_id = '1238';
    var comment_page = 0;
    var comment_can_load_more = true;
    var comment_loading = false;
    var current_device = 'mobile';

    function decodeHtml(html) {
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    function isMobile() {

        try {
            document.createEvent("TouchEvent");
            return true;
        } catch (e) {
            return false;
        }

    }

    //???
    function changeOrder() {
        if ($('.chapter-btn').length === 0) {
            getChapterList(1);
        } else {
            var order = $("#orders").attr("data-value");
            if (order == 1) {
                $("#orders").attr("data-value", 0).removeClass('fa-sort-numeric-down').addClass('fa-sort-numeric-up');
                window.order = 0;
                getChapterList();
            } else {
                $("#orders").attr("data-value", 1).removeClass('fa-sort-numeric-up').addClass('fa-sort-numeric-down');
                window.order = 1;
                getChapterList();
            }
        }

    }

    //?啣?霂捏
    let last_addComment_time = 0;
    function addComment(manhua_id = 0, capter_id = 0) {
        if(Date.now() - last_addComment_time < 5000) return;
        last_addComment_time = Date.now();

        let params = {};
        if (manhua_id > 0)
            params.manhua_id = manhua_id;
        if (capter_id > 0)
            params.capter_id = capter_id;
        params.content = stickerPicker.getFormattedContent(0);
        appCenter.showLoadingToast('?葉...');

        $.post('/home/api/addComment',params,function (res) {
            window.toast.hide();
            if (0 !== res.code && 1 !== res.code ) {
                window.toast.fail({
                    title : "?潛??航炊!",
                    duration : 1000
                });
            }else{
                if(res.code == 1){
                    Swal.fire({
                      icon: "success",
                      title: res.msg,
                      showConfirmButton: false,
                      timer: 1500
                    });
                }else{
                    Swal.fire({
                      icon: "error",
                      title: res.msg,
                      showConfirmButton: false,
                      timer: 1500
                    });
                }
                setTimeout(function () {
                    stickerPicker.clearContent(0);
                    comment_mod('new');
                    getCommentList(false, true);
                }, 800)
            }
        })

    }

    //?啣?sub??
    let last_addSubComment_time = 0;
    function addSubComment(comment_id) {
        if(Date.now() - last_addSubComment_time < 5000) return;
        last_addSubComment_time = Date.now();

        let params ={};
        params.comment_id = comment_id;
        params.content = stickerPicker.getFormattedContent(comment_id);

        appCenter.showLoadingToast('?潮葉...');

        $.post('/home/api/addComment',params,function (res) {
            window.toast.hide();
            if (0 !== res.code && 1 !== res.code ) {
                window.toast.fail({
                    title : "?潛??航炊!",
                    duration : 1000
                });
            }else{
                if(res.code == 1){
                    Swal.fire({
                      icon: "success",
                      title: res.msg,
                      showConfirmButton: false,
                      timer: 1500
                    });
                }else{
                    Swal.fire({
                      icon: "error",
                      title: res.msg,
                      showConfirmButton: false,
                      timer: 1500
                    });
                }
                setTimeout(function () {
                    comment_mod('new');
                    getSubCommentList(comment_id, false, true);
                    stickerPicker.clearContent(comment_id);
                },1500)
            }
        })

        appCenter.doAddComment('/home/api/addComment', params, false, function (data) {
            window.toast.hide();
            getSubCommentList(comment_id, false, true);
            // $('.comment_content').val('');
            // let current_comment_count = parseInt($('#comment_count').text().replace('+','').trim());
            // $('#comment_count').text( current_comment_count>=999?'999+':current_comment_count+1 );
        });
    }

    $(document).on('keyup','textarea[name="mes"]',function () {
        if($('textarea[name="mes"]').val()!=='' && !$('.btn-comment-send').hasClass('btn-comment-send-active') ){
            $('.btn-comment-send').addClass('btn-comment-send-active');
        }

        if($('textarea[name="mes"]').val()===''){
            $('.btn-comment-send').removeClass('btn-comment-send-active');
        }

    });

    // ?芷?芸楛??霈?    function bthTrash( id, comment_id) {
        console.log( 'bthTrash') ;
        $.ajax({
            url: '/home/book/trash_comment',
            type: 'post',
            data: {
                id: id,
                comment_id: comment_id,
            },
            success: function (data) {
                data2 = JSON.parse(data);
                if (data2.status == '200') {
                    getCommentList(false);
                } else {
                }
            }
        });
    }

    // ??
    function btThumbs( id, comment_id, reply_to) {
        var objI = $('#Thumbs_'+comment_id).children('i') ;
        // console.log( objI) ;
        if(__UID===''){

            toast.fail({
                title: "霂瑕??餃?",
                duration: 2000
            });
            return;
        }
        $.ajax({
            url: '/home/book/thumbs',
            type: 'post',
            data: {
                id: id,
                comment_id: comment_id,
                reply_to: reply_to,
            },
            success: function (data) {
                // console.log( data) ;
                // data2 = JSON.parse(data);
                // console.log( data2) ;
                if (data.status == '200') {
                    objI.html( " "+data.count) ;
                    if ( data.faIcon === 'up') {
                        objI.removeClass('fa-thumbs-o-up').addClass('fa-thumbs-up');
                    } else {
                        objI.removeClass('fa-thumbs-up').addClass('fa-thumbs-o-up');
                    }
                    console.log(objI) ;
                } else {

                }
            }
        });
    }

    // ??
    function btThumbsDown( id, comment_id, reply_to) {
        var objI = $('#ThumbsDown_'+comment_id).children('i') ;
        // console.log( objI) ;
        if(__UID===''){

            toast.fail({
                title: "霂瑕??餃?",
                duration: 2000
            });
            return;
        }
        let is_sue = confirm('閬?撟嗡蜀?亥???霈箔?嚗?);
        $.ajax({
            url: '/home/book/thumbsDown',
            type: 'post',
            data: {
                id: id,
                comment_id: comment_id,
                is_sue: is_sue ? 1 : 0,
                reply_to: reply_to,
            },
            success: function (data) {
                // console.log( data) ;
                // data2 = JSON.parse(data);
                // console.log( data2) ;
                if (data.status == '200') {
                    objI.html( " "+data.count) ;
                    if ( data.faIcon === 'up') {
                        objI.removeClass('fa-thumbs-o-down').addClass('fa-thumbs-down');
                    } else {
                        objI.removeClass('fa-thumbs-down').addClass('fa-thumbs-o-down');
                    }
                    console.log(objI) ;
                } else {

                }
            }
        });
    }

    // ?梢?閰?(霈??)嚚??啗?霈?| 憸挽??
    function comment_mod( mod) {
        // console.log( mod) ;
        switch (mod) {
            case 'hot' :
                comment_loadmod = 'hot' ;
                var nowObj = $('#comment-item-hot') ;
                break ;
            case 'new' :
                comment_loadmod = 'new' ;
                var nowObj = $('#comment-item-new') ;
                break ;
            case 'asc' :
                comment_loadmod = 'asc' ;
                var nowObj = $('#comment-item-asc') ;
                break ;
        }
        // $('.comment-class-item').each( function () {
        //     if ( $(this).data('group') == mod) {
        //         console.log( $(this).css( 'color', '#2a638d')) ;
        //     } else {
        //         console.log( $(this).css( 'color', '#0c0c0c')) ;
        //     }
        // }) ;
        $('.comment-class-item').css('color', '#0c0c0c');
        nowObj.css( 'color', '#2a638d') ;
        $('.reader-infinite-preloader').show();
        getCommentList();
    }

    $( '.comment-class-item').click( function () {
        var mod = $(this).data('group') ;
        console.log('comment-class-item') ;
        switch (mod) {
            case 'hot' :
                comment_loadmod = 'hot' ;
                break ;
            case 'new' :
                comment_loadmod = 'new' ;
                break ;
            case 'asc' :
                comment_loadmod = 'asc' ;
                break ;
        }
        if ( mod !== undefined) {
        }
    });
    //霈??霈?    function getCommentList(loadMore = false, force = false) {
        if (loadMore) {
            comment_page += 1;
        } else {
            comment_page = 0;
        }
        comment_loading = true;
        appCenter.showLoadingToast('?蝸銝?..');
        $.ajax({
            url: '/home/api/getComment',
            type: 'post',
            data: {
                manhua_id: '1238',
                capter_id: '22817',
                page: comment_page,
                loadMod: comment_loadmod,
                force: force
            },
            success: function (data) {
                let html = "";
                if (data.succ) {
                    html = template("commentItem", data);

                    let response = data.result;

                    if (response && response.is_last == 1) {
                        comment_can_load_more = false;
                    } else {
                        comment_can_load_more = true;
                    }

                    if(response.ad){
                        html = html.replace(/<div class="comment-ad">.*?<\/div>/, response.ad);
                    }

                    if (loadMore) {
                        $('#comment-list-block').append(decodeHtml(html));
                    } else {
                        $('#comment-list-block').html($('.comment-item').html());
                        $('#comment-list-block').append(decodeHtml(html));
                    }
                } else {
                    if ($('#comment-list-block .forum-list').length === 0) {
                        $('#comment-list-block').html(
                            '<div class="" style="\n' +
                            '    width: 100%;\n' +
                            '    text-align: center;\n' +
                            '    margin-top: 1rem;\n' +
                            '">?桀?瘝⊥?霂捏?? 韏嗅翰撘?舀霂???/div>'
                        );

                    } else {
                        comment_page > 0 && $('#comment-list-block').append('<div class="" style="\n' +
                            '    width: 100%;\n' +
                            '    text-align: center;\n' +
                            '    margin-top: 0.3rem;\n' +
                            '">撌脩?瘝⊥??游?霂捏鈭?/div>');
                        $('.reader-infinite-preloader').hide();
                    }
                    comment_can_load_more = false;
                }
            },
            complete: function (XMLHttpRequest, textStatus) {
                window.toast.hide();
                comment_loading = false;
            }

        });
    }
    function showSubComment(comment_id){
        let ele = $('#Replies_'+comment_id);
        if(ele.data('loaded') != '1'){
            getSubCommentList(comment_id);
        }else{
            ele.toggle();
        }
    }
    function getSubCommentList(comment_id, loadMore=false, force = false){
        if(!comment_id) return;
        let ele = $('#Replies_'+comment_id);
        ele.data('loaded', 1);
        if(loadMore){
            ele.data('comment_page', ele.data('comment_page')+1);
        }else{
            ele.data('comment_page', 0);
        }
        appCenter.showLoadingToast('?蝸銝?..');
        $.ajax({
            url: '/home/api/getSubComment',
            type: 'post',
            data: {
                comment_id: comment_id,
                manhua_id: 1238,
                page: ele.data('comment_page'),
                force: force
            },
            success: function (data) {
                let html = "";

                let ele = $('#Replies_'+comment_id);

                data.comment_id = comment_id;
                html = template("subCommentItem", data);
                if(data.result && data.result.list && data.result.is_last==1 ){
                    ele.data('comment_can_load_more', false);
                }else{
                    ele.data('comment_can_load_more', true);
                }
                if(loadMore)
                    ele.append(decodeHtml(html));
                else
                    ele.html(decodeHtml(html));
                if (!data.succ) {
                    ele.data('comment_can_load_more', false);
                }
            },
            complete: function (XMLHttpRequest, textStatus) {
                window.toast.hide();
            }

        });
    }
    function copyCoupon(serialNumber){
        navigator.clipboard.writeText(serialNumber);
        Swal.fire('銴ˊ摨???','','success')
    }
    $('.reader-cartoon-chapter').find('a').attr('target','_blank');

    $(document).on('keyup', 'textarea[name="mes"]', function () {
        if ($('textarea[name="mes"]').val() !== '' && !$('.btn-comment-send').hasClass('btn-comment-send-active')) {
            $('.btn-comment-send').addClass('btn-comment-send-active');
        }

        if ($('textarea[name="mes"]').val() === '') {
            $('.btn-comment-send').removeClass('btn-comment-send-active');
        }

    });
    //??閰?
    $(document).on('click', '.forum-btn', function () {
        show_comment()
        getCommentList()
        let content_text = $('#comment-list-block').text().trim();
    });
    $(document).on('click', '.forum-btn-disabled', function () {
        toast.fail({
            title: "銝??曇?隢?,
            duration: 2000
        });
    });

    var leftpannel_ad = 0 ; // ?湧??桅?

    $(function () {
        $(".hide-navbar-on-scroll").scroll(function () {
            var nscrollTop = $(this).scrollTop();
            var nscrollHeight = $('.reader-cartoon-chapter').height();
            var nwindowHeight = window.screen.height;
            var currentScroll = (nscrollTop + nwindowHeight);
            let adHeight = $('.').height();
            $(window).trigger('scroll');
            currentScroll = current_device === 'mobile' ? currentScroll + 850 : currentScroll;
            if(current_device==='mobile' && adHeight>0){
                currentScroll+=parseInt(adHeight);
            }
            if (currentScroll >= (nscrollHeight)) {

                $("#actions-" + manhua_id).addClass('modal-in');
            } else if ($("#actions-" + manhua_id).hasClass('modal-in')) {
                $("#actions-" + manhua_id).removeClass('modal-in');
            }
        });

        $('#chapterDirectory .block-title').css('font-size', '0.22rem').append(
            '<i class="fas fa-sort-numeric-down change-order" id="orders" onclick="changeOrder()" data-value="1"' +
            ' style="cursor: pointer    color: #ffbf99;font-size: 0.22rem;"></i></span>'
        );

        $('#comment-text-block-emoji').emoji({
            place: 'after',
            button: ''
        });

        autosize($('textarea'));

        $("#chapter").click(function () {
            $(this).children("i").toggleClass("fa-sort-numeric-down fa-sort-numeric-up");
        });
        $('.close-popup-btn').click(function () {
            $('.forum-pop').removeClass('pop-show');
        });
        $('#leftpannel').addClass('display-flex justify-content-space ').css('padding', '.1rem .08rem').css('flex-wrap', 'wrap').css('width', '95%') ;
    });

    // ??瘚桀? 憌筑撘誨??    $(".sponsor-colse").click( function () {
        $(this).parent().css("display", "none") ;
    });

    //?瑕?蝡??”
    function getChapterList() {
        appCenter.showLoadingToast('?蝸銝?..');

        fetch('/home/api/getChapterListInChapter/tp/' + 1238 + "-" + window.order + "-" + window.page + "-" + 1000)
        .then(response => response.json())
        .then(response => {
            let data = response.result;
            var html = "";
            html = template("left_chpater_list", data);
            var listStr = "";
            var arr = listStr.includes(",") ? listStr.split(",") : [listStr];

            //?曄內?△蝏辣

            $('#leftpannel').html(html);
            if ( leftpannel_ad == 0) {
                $('.virtual-list').append( $('.ad-temp').html()) ;
                leftpannel_ad = 1 ;
            }

            if (data.history !== undefined) {
                if (data.history['m_1238']) data.history['m_1238'] = data.history['m_1238'].map(i=>Number(i));
                $('#leftpannel .chapter-btn').each(function () {
                    if (data.history['m_1238'] && data.history['m_1238'].indexOf($(this).data('cid')) > -1) {
                        $(this).addClass('seen');
                    }
                })
            }

            $('#leftpannel .chapter-btn').each(function () {
                if (arr.indexOf($(this).data('cid').toString()) > -1) {
                    $(this).find('a').addClass('active');
                }else{
                    $(this).find('a').removeClass('active');
                }
            });

            window.toast.hide();

            $('#mask').css({height: $('#menu').height()+200})
        });
    }

    $('.reader-cartoon-image').click(function () {
        //$('.actions-backdrop').addClass('backdrop-in');
        $("#actions-" + manhua_id).toggleClass('modal-in');
        $('.md').addClass('with-modal-actions');
        $('body').addClass('reading');
        // $('.ad-inline').css('padding-bottom','') ;
        console.log( 'reader-cartoon-image') ;
        console.log( 'manhua_id:' + manhua_id) ;
    });

    function share2() {
        $('.actions-backdrop').removeClass('backdrop-in');
        $("#bookActions-" + 1238).remove();
        shareLine();
    }

    //fenxiang
    function shareLine() {
        $('.dialog-backdrop').addClass('backdrop-in');
        $('.dialog').find('.dialog-title').html('?澈瞍怎<i class="fas fa-times close-share" ' +
            'style="font-size: 0.2rem;cursor:pointer;float: right;margin:0.1rem;    position: relative;\n' +
            '    top: -0.1rem;" aria-hidden="true"></i>');
        //$('.dialog').find('.dialog-text').html('銴ˊ憒????嚗?鈭怎策閬芸?憟賢?嚗?餈?鈭綽?QQ蝢歹?敺桐縑蝢歹?隢?蝑?銝?行?鈭粹????喳?脰?30?詨馳嚗?鈭箸??交??活?箔???);
        $('.dialog').find('input[type="link"]').val('http://boylove.cc/home/book/index/id/1238');
        $('.dialog').show();
    }

    $(document).on('click', '.close-share', function () {
        $('.dialog-backdrop').removeClass('backdrop-in');
        $('.dialog').hide();
    });

    //???粉
    function onRead(id) {
        // window.location.href = '/home/book/capter/id/' + id;
    }

    //?????冽?嗅鈭辣
    function initBottomBarEvent() {
        if ($('#actions-' + manhua_id).length === 0) {
            var addItem = $('#actions').clone(true).attr('id', 'actions-' + manhua_id);
            $('.actions-backdrop').after(addItem);
            $("#actions-" + manhua_id).addClass('modal-in');
        }

        $(document).on( "click", ".bottom-btn", function () {
            var type = $(this).data('value');
            if (type == 'prev') {
                getNearByChapter(0);
            }
            else if (type == 'next') {
                getNearByChapter(1);
            }
        });
    }

    //?瑕???????    function getNearByChapter(next) {
        appCenter.showLoadingToast('?蝸銝?..');
        //霂瑟?
        $.getJSON('/home/api/chapter_nearby?manhua_id=1238&capter_id=22817&next=' + next, function (data) {
            window.toast.hide();
            if (data) {
                if (data.succ) {
                    window.location.href = '/home/book/capter/id/' + data.result.id;
                } else {
                    appCenter.showFailToast(data.msg);
                }
            }
        });
    }

    initBottomBarEvent();

    function _stop(event) {
        $("#actions-" + manhua_id).addClass('modal-in');
        // alert(2);
    }

    function _touch(event) {
        $("#actions-" + manhua_id).removeClass('modal-in');
        // alert(1);
    }

    $('.icon-logo').click(function () {
        location.href = '/';
    });

    
    
    // 瞍怎?Ⅳ?賊?
    //if ( lazySwitch ) {
        $("img.lazy").lazyload({
            placeholder: "https://img.boylove.cc/static/images/load.png",
            effect: "fadeIn",
            // 頝喲????槌azy loading撠?Ⅳ頝喲??憿??之??蝭?隞交?撠?蝣潸?頝喲?瘜?            threshold: 5000
        });
    //}

    const pageSections = document.querySelectorAll(`[data-page]`);
    const pageSelect = document.getElementById('page-select');
    const totalPage = pageSections.length;
    const lastSection = pageSections[pageSections.length - 1];

    // ?冽????????★
    pageSections.forEach(section => {
        const option = document.createElement('option');
        option.value = section.getAttribute('data-page');
        option.textContent = `${section.getAttribute('data-page')} / ${totalPage}`;
        pageSelect.appendChild(option);
    });

    // ?銝????鈭辣
    pageSelect.addEventListener('change', function() {
        const selectedSection = document.querySelector(`[data-page="${this.value}"]`);
        selectedSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    });

    // ?皛鈭辣嚗??唬?????    function updatePageSelect(){
        let currentPage = '';
        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        pageSections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                currentPage = section.getAttribute('data-page');
            }
        });

        // 憒?皛雿蔭頞????憿蛛???????憿萇?憿萇?
        if (scrollTop + windowHeight >= documentHeight) {
            currentPage = lastSection.getAttribute('data-page');
        }

        if (currentPage) {
            pageSelect.value = currentPage;
        }
    }

    window.addEventListener('scroll', updatePageSelect);

    // ???嗆?唬?????    function initialLoadPage() {
        updatePageSelect();
    }

    initialLoadPage();
</script>