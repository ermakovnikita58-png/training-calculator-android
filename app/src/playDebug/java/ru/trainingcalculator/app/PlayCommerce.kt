package ru.trainingcalculator.app

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

internal class PlayCommerce(context: Context, private val updated: (Result<List<StoreReceipt>>) -> Unit) {
    private val products = mutableMapOf<String, ProductDetails>()
    private val client by lazy {
        BillingClient.newBuilder(context.applicationContext)
            .setListener { result, purchases -> updated(result.map { receipts(purchases.orEmpty()) }) }
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build()
    }

    fun connect(result: (Result<Unit>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(status: BillingResult) = result(status.map { Unit })
            override fun onBillingServiceDisconnected() = Unit
        })
    }

    fun catalog(ids: List<String>, result: (Result<List<StoreOffer>>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        val request = QueryProductDetailsParams.newBuilder().setProductList(ids.distinct().map {
            QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.SUBS).build()
        }).build()
        client.queryProductDetailsAsync(request) { status, details ->
            result(status.map {
                products.clear()
                details.productDetailsList.map { product ->
                    products[product.productId] = product
                    val prices = product.subscriptionOfferDetails.orEmpty().mapNotNull { offer ->
                        offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice
                    }
                    StoreOffer(product.productId, product.title, prices.distinct().joinToString(" / "))
                }
            })
        }
    }

    fun begin(activity: Activity, productId: String, offerToken: String, accountId: String): Result<Unit> {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return disabled()
        val product = products[productId] ?: return Result.failure(IllegalArgumentException("Unknown product"))
        if (product.subscriptionOfferDetails.orEmpty().none { it.offerToken == offerToken }) {
            return Result.failure(IllegalArgumentException("Unknown offer"))
        }
        val item = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product).setOfferToken(offerToken).build()
        return runCatching {
            BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(item))
                .setObfuscatedAccountId(commerceAccountId(accountId)).build()
        }.fold({ params -> client.launchBillingFlow(activity, params).map { Unit } }, { Result.failure(it) })
    }

    fun restore(result: (Result<List<StoreReceipt>>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        client.queryPurchasesAsync(params) { status, purchases -> result(status.map { receipts(purchases) }) }
    }

    fun close() { if (BuildConfig.FORGE_ENABLE_PAYMENTS) client.endConnection() }

    private fun receipts(purchases: List<Purchase>) = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        .flatMap { purchase -> purchase.products.map { StoreReceipt(Store.GOOGLE_PLAY, it, purchase.purchaseToken) } }

    private fun <T> BillingResult.map(value: () -> T): Result<T> = when (responseCode) {
        BillingClient.BillingResponseCode.OK -> runCatching(value)
        BillingClient.BillingResponseCode.USER_CANCELED -> Result.failure(java.util.concurrent.CancellationException("Purchase canceled"))
        else -> Result.failure(IllegalStateException("Play Billing code $responseCode"))
    }

    private fun <T> disabled(): Result<T> = Result.failure(IllegalStateException("FORGE payments disabled"))
}
