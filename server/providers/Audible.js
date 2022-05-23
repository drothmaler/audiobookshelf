const axios = require('axios')
const { stripHtml } = require('string-strip-html')
const Logger = require('../Logger')

class Audible {
    constructor() { }

    cleanResult(item) {
        var { title, subtitle, asin, authors, narrators, publisherName, summary, releaseDate, image, genres, seriesPrimary, seriesSecondary, language } = item;

        var series = []
        if(seriesPrimary) series.push(seriesPrimary)
        if(seriesSecondary) series.push(seriesSecondary)

        var genresFiltered = genres ? genres.filter(g => g.type == "genre") : []
        var tagsFiltered = genres ? genres.filter(g => g.type == "tag") : []

        return {
            title,
            subtitle: subtitle || null,
            author: authors ? authors.map(({ name }) => name).join(', ') : null,
            narrator: narrators ? narrators.map(({ name }) => name).join(', ') : null,
            publisher: publisherName,
            publishedYear: releaseDate ? releaseDate.split('-')[0] : null,
            description: summary ? stripHtml(summary).result : null,
            cover: image,
            asin,
            genres: genresFiltered.length > 0 ? genresFiltered.map(({ name }) => name).join(', ') : null,
            tags: tagsFiltered.length > 0 ? tagsFiltered.map(({ name }) => name).join(', ') : null,
            series: series != [] ? series.map(({name, position}) => ({ series: name, volumeNumber: position })) : null,
            language: language ? language.charAt(0).toUpperCase() + language.slice(1) : null
        }
    }

    isProbablyAsin(title) {
        return /^[0-9A-Z]{10}$/.test(title)
    }

    asinSearch(asin) {
        asin = encodeURIComponent(asin);
        var url = `https://api.audnex.us/books/${asin}`
        Logger.debug(`[Audible] ASIN url: ${url}`)
        return axios.get(url).then((res) => {
            if (!res || !res.data || !res.data.asin) return null
            return res.data
        }).catch(error => {
            Logger.error('[Audible] ASIN search error', error)
            return []
        })
    }

    async search(title, author, asin) {        
        var items
        if(asin) {
            items = [await this.asinSearch(asin)]
        }
        
        if (!items && this.isProbablyAsin(title)) {
            items = [await this.asinSearch(title)]
        }

        if(!items) {
            var queryObj = {
                response_groups: 'rating,series,contributors,product_desc,media,product_extended_attrs',
                image_sizes: '500,1024,2000',
                num_results: '25',
                products_sort_by: 'Relevance',
                title: title
            };
            if (author) queryObj.author = author
            var queryString = (new URLSearchParams(queryObj)).toString();
            var url = `https://api.audible.com/1.0/catalog/products?${queryString}`
            Logger.debug(`[Audible] Search url: ${url}`)
            items = await axios.get(url).then((res) => {
                if (!res || !res.data || !res.data.products) return null
                return Promise.all(res.data.products.map(result => this.asinSearch(result.asin)))
            }).catch(error => {
                Logger.error('[Audible] query search error', error)
                return []
            })
        }

        return items ? items.map(item => this.cleanResult(item)) : []
    }
}

module.exports = Audible