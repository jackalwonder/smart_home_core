<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '实体工具箱',
  },
  entities: {
    type: Array,
    default: () => [],
  },
  selectedEntityId: {
    type: String,
    default: '',
  },
  framed: {
    type: Boolean,
    default: true,
  },
  canBind: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['select-entity'])

const searchQuery = ref('')
const activeCategory = ref('all')

const normalizedEntities = computed(() =>
  props.entities.map((entity) => ({
    id: String(entity.id ?? ''),
    name: entity.name || entity.id || '未命名实体',
    category: String(entity.category || 'other'),
    categoryLabel: entity.categoryLabel || entity.category || '未分类',
    subtitle: entity.subtitle || entity.id || '',
    searchText: String(entity.searchText || '').toLowerCase(),
  })),
)

const categoryOptions = computed(() => {
  const buckets = new Map()
  normalizedEntities.value.forEach((entity) => {
    if (!buckets.has(entity.category)) {
      buckets.set(entity.category, {
        value: entity.category,
        label: entity.categoryLabel || entity.category,
        count: 0,
      })
    }
    buckets.get(entity.category).count += 1
  })

  return [
    {
      value: 'all',
      label: 'all',
      count: normalizedEntities.value.length,
    },
    ...Array.from(buckets.values()),
  ]
})

const filteredEntities = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return normalizedEntities.value.filter((entity) => {
    const hitCategory = activeCategory.value === 'all' || entity.category === activeCategory.value
    const hitSearch = !keyword || entity.searchText.includes(keyword)
    return hitCategory && hitSearch
  })
})

watch(categoryOptions, (options) => {
  const exists = options.some((item) => item.value === activeCategory.value)
  if (!exists) {
    activeCategory.value = 'all'
  }
})

function handleSelectEntity(entityId) {
  if (!props.canBind) {
    return
  }
  emit('select-entity', entityId)
}
</script>

<template>
  <div :class="[props.framed ? 'settings-toolbox' : 'settings-toolbox__embed', 'settings-toolbox--entity']">
    <div class="settings-toolbox__head">
      <strong>{{ title }}</strong>
      <input v-model="searchQuery" type="text" placeholder="搜索实体..." />
    </div>

    <div class="settings-toolbox__chips">
      <button
        v-for="category in categoryOptions"
        :key="category.value"
        type="button"
        class="settings-toolbox__chip"
        :class="{ 'is-active': activeCategory === category.value }"
        @click="activeCategory = category.value"
      >
        {{ category.label }}
      </button>
    </div>

    <section class="settings-toolbox__section">
      <div class="settings-section-head">
        <strong>实体列表</strong>
        <span class="settings-section-meta">{{ filteredEntities.length }} / {{ normalizedEntities.length }}</span>
      </div>

      <div v-if="filteredEntities.length" class="settings-toolbox__list settings-toolbox__list--dense">
        <button
          v-for="entity in filteredEntities"
          :key="entity.id"
          type="button"
          class="settings-toolbox__item settings-toolbox__item--entity settings-toolbox__item--pickable"
          :class="{ 'is-selected': selectedEntityId && selectedEntityId === entity.id }"
          @click="handleSelectEntity(entity.id)"
        >
          <div>
            <strong>{{ entity.name }}</strong>
            <p>{{ entity.subtitle }}</p>
          </div>
          <span>{{ entity.category }}</span>
        </button>
      </div>
      <div v-else class="settings-toolbox__empty">
        当前筛选条件下没有实体
      </div>
      <p v-if="!canBind" class="settings-toolbox__hint">
        先在舞台中选中一个热点，再从左侧实体列表绑定。
      </p>
    </section>
  </div>
</template>
