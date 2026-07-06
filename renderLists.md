I am creating a blog on how to render large lists on the UI efficiently. The blog will cover various scenarios and optimizations to ensure smooth performance and user experience.
This is the project that is going to get attached to the blog. The project will demonstrate different techniques for handling large lists, including virtualization, pagination, caching, and using IndexedDB for better data management. 

Title: Rendering the large list on ui.

main points: handling the pointer position when the previous or next page comes while scrolling, showing the loaders correctly when the user reaches the end.
:making sure the storage of the browser is not filled up with the cache and the browser crashes.

commit 1: initial commit
-> first we will create the setup
-> setup the backend to send a large amount of list.(no pagination, no limit, just a large list)


senario 1: when the list becomes to large that it take time to load on the ui. 
-> add the virtualization for it
(then we will show the example where this is helpful)
senario 2: when the list becomes so large that it cross the limits of the json from backend.
-> we add the pagination for it and set up the proper pointers up and down. it is index pointer not number as the list can keep on change(add,delete,update).
senario 3: too many backend calls we can do the cache. 
-> add the tanstack for it. along with it show when how to handle the mutation for it.
senario 4: when the size of page is incosistent. this happens with the cases like chat messages where some messages take so much space that it will 
second level optimization
-> better is to add the index db to it, also. so now hot data stays in heap and more previous data stays in index db.

-> for more advance case we can create our own tanstack and virtualization layer via code so that we don't add unwanted size to the ui.
