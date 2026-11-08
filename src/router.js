import { createRouter, createWebHashHistory } from 'vue-router'
import FilesView from './views/FilesView.vue'
import ManageView from './views/ManageView.vue'

// hash 路由：部署在 GitHub Pages 任意子路径下刷新都不会 404
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/files' },
    { path: '/files', name: 'files', component: FilesView },
    { path: '/manage', name: 'manage', component: ManageView },
    { path: '/:pathMatch(.*)*', redirect: '/files' },
  ],
})

export default router
