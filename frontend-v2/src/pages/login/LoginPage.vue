<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="login-page">
    <div class="login-page__veil" />
    <div class="login-page__embers" />

    <header class="login-topbar">
      <div class="login-topbar__time">下午 5:12  3月31日 周二</div>
      <nav class="login-topbar__nav">
        <RouterLink to="/dashboard">总览</RouterLink>
        <RouterLink to="/security">安防</RouterLink>
        <span class="is-active">影视</span>
      </nav>
    </header>

    <main class="login-page__content">
      <section class="login-poster">
        <div class="login-poster__halo" />
        <div class="login-poster__ring" />
        <div class="login-poster__title">MOVIEPILOT</div>
      </section>

      <section class="login-card">
        <div class="login-card__locale">简体中文</div>
        <div class="login-card__brand">MOVIEPILOT</div>
        <label class="login-field">
          <span>用户名</span>
          <input type="text" placeholder="输入用户名">
        </label>
        <label class="login-field">
          <span>密码</span>
          <input type="password" placeholder="输入密码">
        </label>

        <label class="login-checkbox">
          <input type="checkbox" checked>
          <span>保持登录</span>
        </label>

        <button type="button" class="login-button login-button--primary">登录</button>
        <button type="button" class="login-button login-button--secondary">使用通行密钥登录</button>
      </section>
    </main>
  </div>
</template>
