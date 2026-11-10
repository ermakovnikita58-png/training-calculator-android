package ru.trainingcalculator.app

import android.content.Intent
import ru.rustore.sdk.pay.RuStorePayClient
import ru.rustore.sdk.pay.model.BillingSubscription
import ru.rustore.sdk.pay.model.OrderId
import ru.rustore.sdk.pay.model.ProductId
import ru.rustore.sdk.pay.model.ProductPurchaseParams

internal class RuStoreCommerce {
    private val client get() = RuStorePayClient.instance

    fun catalog(ids: List<String>, result: (Result<List<StoreOffer>>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        client.getProductInteractor().getProducts(ids.distinct().map(::ProductId))
            .addOnSuccessListener { products ->
                result(Result.success(products.map {
                    StoreOffer(it.productId.value, it.title.value, it.amountLabel.value)
                }))
            }.addOnFailureListener { result(Result.failure(it)) }
    }

    fun begin(productId: String, backendOrderId: String, result: (Result<StoreReceipt>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        val purchases = client.getPurchaseInteractor()
        purchases.purchase(ProductPurchaseParams(productId = ProductId(productId), orderId = OrderId(backendOrderId)))
            .addOnSuccessListener { purchase ->
                purchases.getPurchase(purchase.purchaseId)
                    .addOnSuccessListener { result(runCatching { receipt(it as BillingSubscription) }) }
                    .addOnFailureListener { result(Result.failure(it)) }
            }.addOnFailureListener { result(Result.failure(it)) }
    }

    fun restore(result: (Result<List<StoreReceipt>>) -> Unit) {
        if (!BuildConfig.FORGE_ENABLE_PAYMENTS) return result(disabled())
        client.getPurchaseInteractor().getBillingSubscriptions()
            .addOnSuccessListener { purchases -> result(runCatching { purchases.map(::receipt) }) }
            .addOnFailureListener { result(Result.failure(it)) }
    }

    fun handleReturn(intent: Intent) {
        if (BuildConfig.FORGE_ENABLE_PAYMENTS) client.getIntentInteractor().proceedIntent(intent)
    }

    private fun receipt(purchase: BillingSubscription) =
        StoreReceipt(Store.RUSTORE, purchase.productId.value, requireNotNull(purchase.subscriptionToken).value)

    private fun <T> disabled(): Result<T> = Result.failure(IllegalStateException("FORGE payments disabled"))
}
